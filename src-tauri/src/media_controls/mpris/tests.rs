//! Drives the MPRIS object through real D-Bus messages, without a bus: the
//! replies land in an in-memory outbox.

use super::*;
use crate::media_controls::tests::{plan_secrets, plan_with_secrets, snapshot, Recorder};
use crate::media_controls::Route;
use dbus::arg::{prop_cast, RefArg};
use dbus::message::MessageType;
use pretty_assertions::assert_eq;
use std::cell::RefCell;

const PROPERTIES: &str = "org.freedesktop.DBus.Properties";

fn object_path() -> Path<'static> {
    Path::new(OBJECT_PATH).expect("valid object path")
}

fn service(recorder: &Recorder) -> Crossroads {
    build(Box::new(recorder.clone()))
}

fn update(cr: &mut Crossroads, update: MediaUpdate) -> Vec<Message> {
    cr.data_mut::<Service>(&object_path())
        .expect("the MPRIS object")
        .apply(update)
}

fn start_playing(cr: &mut Crossroads, position_seconds: f64, paused: bool) {
    update(
        cr,
        MediaUpdate::from_snapshot(
            "Arrival",
            &snapshot(position_seconds, Some(100.0), paused),
            false,
        ),
    );
}

fn call(
    cr: &mut Crossroads,
    interface: &str,
    method: &str,
    append: impl FnOnce(Message) -> Message,
) -> Message {
    let mut message = Message::new_method_call(BUS_NAME, OBJECT_PATH, interface, method)
        .expect("valid method call");
    message = append(message);
    message.set_serial(7);
    let outbox = RefCell::new(Vec::new());
    cr.handle_message(message, &outbox)
        .expect("a method call is handled");
    outbox.into_inner().pop().expect("a reply")
}

fn player_call(cr: &mut Crossroads, method: &str) -> Message {
    call(cr, PLAYER_INTERFACE, method, |message| message)
}

fn get(cr: &mut Crossroads, interface: &str, name: &str) -> Variant<Box<dyn RefArg>> {
    let reply = call(cr, PROPERTIES, "Get", |message| {
        message.append2(interface, name)
    });
    assert_eq!(reply.msg_type(), MessageType::MethodReturn, "Get {name}");
    reply.read1().expect("a variant")
}

fn get_text(cr: &mut Crossroads, name: &str) -> String {
    get(cr, PLAYER_INTERFACE, name)
        .0
        .as_str()
        .expect("a string")
        .to_string()
}

fn get_flag(cr: &mut Crossroads, name: &str) -> bool {
    get(cr, PLAYER_INTERFACE, name)
        .0
        .as_u64()
        .expect("a boolean")
        != 0
}

#[test]
fn methods_route_into_the_player() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    start_playing(&mut cr, 40.0, false);

    for method in ["Play", "Pause", "PlayPause", "Stop"] {
        assert_eq!(
            player_call(&mut cr, method).msg_type(),
            MessageType::MethodReturn
        );
    }
    call(&mut cr, PLAYER_INTERFACE, "Seek", |message| {
        message.append1(-15_000_000_i64)
    });
    let track = Path::new(TRACK_ID).expect("valid track id");
    call(&mut cr, PLAYER_INTERFACE, "SetPosition", |message| {
        message.append2(track, 90_000_000_i64)
    });
    // A stale track id is ignored.
    let stale = Path::new("/org/mpris/MediaPlayer2/TrackList/NoTrack").expect("valid path");
    call(&mut cr, PLAYER_INTERFACE, "SetPosition", |message| {
        message.append2(stale, 10_000_000_i64)
    });

    assert_eq!(
        recorder.routes(),
        vec![
            Route::SetPaused(false),
            Route::SetPaused(true),
            Route::SetPaused(true),
            Route::Stop,
            Route::SeekTo(25.0),
            Route::SeekTo(90.0),
        ]
    );
}

#[test]
fn methods_do_nothing_while_stopped() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    for method in ["Play", "Pause", "PlayPause", "Stop"] {
        assert_eq!(
            player_call(&mut cr, method).msg_type(),
            MessageType::MethodReturn
        );
    }
    call(&mut cr, PLAYER_INTERFACE, "Seek", |message| {
        message.append1(1_i64)
    });
    assert!(recorder.routes().is_empty());
}

#[test]
fn the_rest_of_the_interface_never_reaches_the_player() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    start_playing(&mut cr, 40.0, false);

    for method in ["Next", "Previous"] {
        assert_eq!(
            player_call(&mut cr, method).msg_type(),
            MessageType::MethodReturn
        );
    }
    for method in ["Raise", "Quit"] {
        let reply = call(&mut cr, ROOT_INTERFACE, method, |message| message);
        assert_eq!(reply.msg_type(), MessageType::MethodReturn);
    }
    let reply = call(&mut cr, PLAYER_INTERFACE, "OpenUri", |message| {
        message.append1("https://example.test/movie.mkv")
    });
    assert_eq!(reply.msg_type(), MessageType::Error);
    // An unknown method is an error, not a bridge.
    let reply = player_call(&mut cr, "SetVolume");
    assert_eq!(reply.msg_type(), MessageType::Error);
    assert!(recorder.routes().is_empty());
}

#[test]
fn properties_expose_the_play_state() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    assert_eq!(get_text(&mut cr, "PlaybackStatus"), "Stopped");
    assert!(!get_flag(&mut cr, "CanPlay"));
    assert!(!get_flag(&mut cr, "CanSeek"));
    assert!(get_flag(&mut cr, "CanControl"));
    assert!(!get_flag(&mut cr, "CanGoNext"));

    start_playing(&mut cr, 12.0, false);
    assert_eq!(get_text(&mut cr, "PlaybackStatus"), "Playing");
    assert!(get_flag(&mut cr, "CanPlay"));
    assert!(get_flag(&mut cr, "CanPause"));
    assert!(get_flag(&mut cr, "CanSeek"));
    assert_eq!(
        get(&mut cr, PLAYER_INTERFACE, "Position").0.as_i64(),
        Some(12_000_000)
    );
    assert_eq!(get(&mut cr, PLAYER_INTERFACE, "Rate").0.as_f64(), Some(1.0));

    start_playing(&mut cr, 12.0, true);
    assert_eq!(get_text(&mut cr, "PlaybackStatus"), "Paused");

    let identity = get(&mut cr, ROOT_INTERFACE, "Identity");
    assert_eq!(identity.0.as_str(), Some("Fluster"));
}

#[test]
fn metadata_reaches_the_bus_as_track_id_title_and_length() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    start_playing(&mut cr, 0.0, false);

    let reply = call(&mut cr, PROPERTIES, "Get", |message| {
        message.append2(PLAYER_INTERFACE, "Metadata")
    });
    let metadata: Variant<PropMap> = reply.read1().expect("a metadata dictionary");
    let metadata = metadata.0;
    let mut keys: Vec<&str> = metadata.keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["mpris:length", "mpris:trackid", "xesam:title"]);
    assert_eq!(
        prop_cast::<Path>(&metadata, "mpris:trackid").map(|path| path.to_string()),
        Some(TRACK_ID.to_string())
    );
    assert_eq!(
        prop_cast::<String>(&metadata, "xesam:title").map(String::as_str),
        Some("Arrival")
    );
    assert_eq!(
        prop_cast::<i64>(&metadata, "mpris:length").copied(),
        Some(100_000_000)
    );
}

#[test]
fn redaction_canary_bus_metadata_and_signals_never_carry_urls_tokens_or_ids() {
    let plan = plan_with_secrets();
    let recorder = Recorder::default();
    let mut cr = service(&recorder);
    let signals = update(
        &mut cr,
        MediaUpdate::from_snapshot(&plan.title, &snapshot(5.0, Some(60.0), false), true),
    );
    let service = cr
        .data_mut::<Service>(&object_path())
        .expect("the MPRIS object");
    let exposed = format!("{:?} {signals:?}", metadata_map(&service.now));
    let bodies: Vec<String> = signals
        .iter()
        .map(|signal| format!("{:?}", signal.get_items()))
        .collect();
    for secret in plan_secrets(&plan) {
        assert!(!exposed.contains(&secret), "MPRIS exposes {secret}");
        for body in &bodies {
            assert!(!body.contains(&secret), "an MPRIS signal exposes {secret}");
        }
    }
}

#[test]
fn updates_signal_what_changed() {
    let recorder = Recorder::default();
    let mut cr = service(&recorder);

    let signals = update(
        &mut cr,
        MediaUpdate::from_snapshot("Arrival", &snapshot(0.0, Some(100.0), false), false),
    );
    assert_eq!(signals.len(), 1);
    let changed: PropertiesPropertiesChanged =
        PropertiesPropertiesChanged::from_message(&signals[0]).expect("PropertiesChanged");
    assert_eq!(changed.interface_name, PLAYER_INTERFACE);
    let mut names: Vec<&str> = changed
        .changed_properties
        .keys()
        .map(String::as_str)
        .collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "CanPause",
            "CanPlay",
            "CanSeek",
            "Metadata",
            "PlaybackStatus"
        ]
    );

    // A position tick is silent; a finished seek says where it landed.
    let silent = update(
        &mut cr,
        MediaUpdate::from_snapshot("Arrival", &snapshot(1.0, Some(100.0), false), false),
    );
    assert!(silent.is_empty());
    let seeked = update(
        &mut cr,
        MediaUpdate::from_snapshot("Arrival", &snapshot(30.0, Some(100.0), false), true),
    );
    assert_eq!(seeked.len(), 1);
    assert_eq!(seeked[0].member().as_deref(), Some("Seeked"));
    assert_eq!(seeked[0].read1::<i64>(), Ok(30_000_000));

    let stopped = update(&mut cr, MediaUpdate::Stopped);
    let changed =
        PropertiesPropertiesChanged::from_message(&stopped[0]).expect("PropertiesChanged");
    assert_eq!(
        prop_cast::<String>(&changed.changed_properties, "PlaybackStatus").map(String::as_str),
        Some("Stopped")
    );
}

/// Serves MPRIS on the real session bus and drives it as a desktop would.
/// Run with `cargo test -- --ignored live_session_bus` inside a desktop session.
#[test]
#[ignore = "needs a D-Bus session bus"]
fn live_session_bus_mpris() {
    use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;

    let name = format!("org.mpris.MediaPlayer2.fluster_test_{}", std::process::id());
    let recorder = Recorder::default();
    let updates = spawn(&name, Box::new(recorder.clone())).expect("a session bus");
    updates
        .send(MediaUpdate::from_snapshot(
            "Arrival",
            &snapshot(10.0, Some(60.0), false),
            false,
        ))
        .expect("the service is running");

    let connection = Connection::new_session().expect("a session bus");
    let proxy = connection.with_proxy(name.as_str(), OBJECT_PATH, Duration::from_secs(2));
    let mut status = String::new();
    for _ in 0..40 {
        status = proxy
            .get::<String>(PLAYER_INTERFACE, "PlaybackStatus")
            .expect("PlaybackStatus");
        if status == "Playing" {
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(status, "Playing");

    let _: () = proxy
        .method_call(PLAYER_INTERFACE, "PlayPause", ())
        .expect("PlayPause");
    let _: () = proxy
        .method_call(PLAYER_INTERFACE, "Seek", (5_000_000_i64,))
        .expect("Seek");
    let _: () = proxy
        .method_call(PLAYER_INTERFACE, "Stop", ())
        .expect("Stop");
    assert_eq!(
        recorder.routes(),
        vec![Route::SetPaused(true), Route::SeekTo(15.0), Route::Stop]
    );
}

/// What `playerctl`, a common MPRIS client, sees and can do.
/// Run with `cargo test -- --ignored playerctl` inside a desktop session.
#[test]
#[ignore = "needs a D-Bus session bus and playerctl"]
fn playerctl_controls_the_service() {
    use std::process::Command;

    let player = format!("fluster_playerctl_{}", std::process::id());
    let recorder = Recorder::default();
    let updates = spawn(
        &format!("org.mpris.MediaPlayer2.{player}"),
        Box::new(recorder.clone()),
    )
    .expect("a session bus");
    updates
        .send(MediaUpdate::from_snapshot(
            "Arrival",
            &snapshot(10.0, Some(60.0), false),
            false,
        ))
        .expect("the service is running");
    let playerctl = |args: &[&str]| -> String {
        let output = Command::new("playerctl")
            .arg("--player")
            .arg(&player)
            .args(args)
            .output()
            .expect("playerctl runs");
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    };
    let mut status = String::new();
    for _ in 0..40 {
        status = playerctl(&["status"]);
        if status == "Playing" {
            break;
        }
        thread::sleep(Duration::from_millis(25));
    }
    assert_eq!(status, "Playing");
    assert_eq!(playerctl(&["metadata", "title"]), "Arrival");
    // playerctl extrapolates the position of a playing track from the rate.
    let position: f64 = playerctl(&["position"]).parse().expect("a position");
    assert!((10.0..11.0).contains(&position), "position {position}");

    playerctl(&["play-pause"]);
    playerctl(&["position", "20"]);
    playerctl(&["stop"]);
    assert_eq!(
        recorder.routes(),
        vec![Route::SetPaused(true), Route::SeekTo(20.0), Route::Stop]
    );
}
