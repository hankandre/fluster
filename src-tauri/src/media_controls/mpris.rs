//! The MPRIS D-Bus service. One thread owns the session-bus connection,
//! answers the desktop, and turns player updates into change signals.
//!
//! Only `org.mpris.MediaPlayer2` and `org.mpris.MediaPlayer2.Player` are
//! served. There is no track list, no playlists, no OpenUri, and no volume.

use super::{
    dispatch, media_trace, route, Changes, MediaAction, MediaTarget, MediaUpdate, MetadataValue,
    NowPlaying,
};
use dbus::arg::{PropMap, RefArg, Variant};
use dbus::blocking::stdintf::org_freedesktop_dbus::{
    PropertiesPropertiesChanged, RequestNameReply,
};
use dbus::blocking::Connection;
use dbus::channel::Sender as _;
use dbus::message::SignalArgs;
use dbus::{Message, Path};
use dbus_crossroads::{Crossroads, IfaceBuilder, MethodErr};
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::thread;
use std::time::Duration;

pub(super) const BUS_NAME: &str = "org.mpris.MediaPlayer2.fluster";
pub(super) const OBJECT_PATH: &str = "/org/mpris/MediaPlayer2";
pub(super) const ROOT_INTERFACE: &str = "org.mpris.MediaPlayer2";
pub(super) const PLAYER_INTERFACE: &str = "org.mpris.MediaPlayer2.Player";
const IDENTITY: &str = "Fluster";
const POLL: Duration = Duration::from_millis(50);

/// The object behind `/org/mpris/MediaPlayer2`.
pub(super) struct Service {
    now: NowPlaying,
    target: Box<dyn MediaTarget>,
}

impl Service {
    pub(super) fn new(target: Box<dyn MediaTarget>) -> Self {
        Self {
            now: NowPlaying::default(),
            target,
        }
    }

    fn handle(&self, action: MediaAction) {
        dispatch(route(action, &self.now), self.target.as_ref());
    }

    /// Applies a player update and returns the signals it causes.
    pub(super) fn apply(&mut self, update: MediaUpdate) -> Vec<Message> {
        let changes = self.now.apply(update);
        change_signals(&self.now, &changes)
    }
}

/// Registers both interfaces and the object. The object starts stopped.
pub(super) fn build(target: Box<dyn MediaTarget>) -> Crossroads {
    let mut cr = Crossroads::new();
    let root = cr.register(ROOT_INTERFACE, register_root);
    let player = cr.register(PLAYER_INTERFACE, register_player);
    cr.insert(OBJECT_PATH, &[root, player], Service::new(target));
    cr
}

fn register_root(b: &mut IfaceBuilder<Service>) {
    b.method("Raise", (), (), |_, _, _: ()| Ok(()));
    b.method("Quit", (), (), |_, _, _: ()| Ok(()));
    b.property("Identity")
        .get(|_, _| Ok(IDENTITY.to_string()))
        .emits_changed_const();
    b.property("CanQuit")
        .get(|_, _| Ok(false))
        .emits_changed_const();
    b.property("CanRaise")
        .get(|_, _| Ok(false))
        .emits_changed_const();
    b.property("HasTrackList")
        .get(|_, _| Ok(false))
        .emits_changed_const();
    b.property("SupportedUriSchemes")
        .get(|_, _| Ok(Vec::<String>::new()))
        .emits_changed_const();
    b.property("SupportedMimeTypes")
        .get(|_, _| Ok(Vec::<String>::new()))
        .emits_changed_const();
}

fn register_player(b: &mut IfaceBuilder<Service>) {
    b.method("Play", (), (), |_, service: &mut Service, _: ()| {
        service.handle(MediaAction::Play);
        Ok(())
    });
    b.method("Pause", (), (), |_, service: &mut Service, _: ()| {
        service.handle(MediaAction::Pause);
        Ok(())
    });
    b.method("PlayPause", (), (), |_, service: &mut Service, _: ()| {
        service.handle(MediaAction::PlayPause);
        Ok(())
    });
    b.method("Stop", (), (), |_, service: &mut Service, _: ()| {
        service.handle(MediaAction::Stop);
        Ok(())
    });
    // CanGoNext and CanGoPrevious are false, so these do nothing.
    b.method("Next", (), (), |_, _, _: ()| Ok(()));
    b.method("Previous", (), (), |_, _, _: ()| Ok(()));
    b.method(
        "Seek",
        ("Offset",),
        (),
        |_, service: &mut Service, (offset,): (i64,)| {
            service.handle(MediaAction::SeekBy(offset));
            Ok(())
        },
    );
    b.method(
        "SetPosition",
        ("TrackId", "Position"),
        (),
        |_, service: &mut Service, (track, position): (Path<'static>, i64)| {
            service.handle(MediaAction::SetPosition {
                current_track: service.now.is_current_track(&track),
                position_us: position,
            });
            Ok(())
        },
    );
    b.method("OpenUri", ("Uri",), (), |_, _, _: (String,)| {
        Err::<(), _>(MethodErr::failed(
            "Fluster opens media only from its Jellyfin library.",
        ))
    });
    b.signal::<(i64,), _>("Seeked", ("Position",));

    b.property("PlaybackStatus")
        .get(|_, service: &mut Service| Ok(service.now.status.as_str().to_string()));
    b.property("Metadata")
        .get(|_, service: &mut Service| Ok(metadata_map(&service.now)));
    // The position changes continuously; clients poll it and listen for Seeked.
    b.property("Position")
        .get(|_, service: &mut Service| Ok(service.now.position_us))
        .emits_changed_false();
    for rate in ["Rate", "MinimumRate", "MaximumRate"] {
        b.property(rate)
            .get(|_, _| Ok(1.0_f64))
            .emits_changed_const();
    }
    b.property("CanPlay")
        .get(|_, service: &mut Service| Ok(service.now.active()));
    b.property("CanPause")
        .get(|_, service: &mut Service| Ok(service.now.active()));
    b.property("CanSeek")
        .get(|_, service: &mut Service| Ok(service.now.can_seek()));
    b.property("CanGoNext")
        .get(|_, _| Ok(false))
        .emits_changed_const();
    b.property("CanGoPrevious")
        .get(|_, _| Ok(false))
        .emits_changed_const();
    b.property("CanControl")
        .get(|_, _| Ok(true))
        .emits_changed_const();
}

/// The metadata as a D-Bus dictionary.
pub(super) fn metadata_map(now: &NowPlaying) -> PropMap {
    let mut map = PropMap::new();
    for (key, value) in now.metadata() {
        let value: Box<dyn RefArg> = match value {
            MetadataValue::ObjectPath(path) => match Path::new(path) {
                Ok(path) => Box::new(path),
                Err(_) => continue,
            },
            MetadataValue::Text(text) => Box::new(text),
            MetadataValue::Micros(micros) => Box::new(micros),
        };
        map.insert(key.to_string(), Variant(value));
    }
    map
}

/// PropertiesChanged for what changed, and Seeked for a jump.
pub(super) fn change_signals(now: &NowPlaying, changes: &Changes) -> Vec<Message> {
    let mut changed = PropMap::new();
    if changes.status {
        changed.insert(
            "PlaybackStatus".into(),
            Variant(Box::new(now.status.as_str().to_string())),
        );
        changed.insert("CanPlay".into(), Variant(Box::new(now.active())));
        changed.insert("CanPause".into(), Variant(Box::new(now.active())));
    }
    if changes.metadata {
        changed.insert("Metadata".into(), Variant(Box::new(metadata_map(now))));
    }
    if changes.status || changes.metadata {
        changed.insert("CanSeek".into(), Variant(Box::new(now.can_seek())));
    }
    let mut signals = Vec::new();
    let Ok(path) = Path::new(OBJECT_PATH) else {
        return signals;
    };
    if !changed.is_empty() {
        let properties = PropertiesPropertiesChanged {
            interface_name: PLAYER_INTERFACE.to_string(),
            changed_properties: changed,
            invalidated_properties: Vec::new(),
        };
        signals.push(properties.to_emit_message(&path));
    }
    if let Some(position) = changes.seeked_to {
        if let Ok(seeked) = Message::new_signal(OBJECT_PATH, PLAYER_INTERFACE, "Seeked") {
            signals.push(seeked.append1(position));
        }
    }
    signals
}

fn own_name(connection: &Connection, name: &str) -> bool {
    matches!(
        connection.request_name(name, false, false, true),
        Ok(RequestNameReply::PrimaryOwner)
    )
}

/// Connects to the session bus as `bus_name`, or as a per-process instance
/// name when another Fluster holds it.
fn connect(bus_name: &str) -> Option<Connection> {
    let connection = Connection::new_session().ok()?;
    let instance = format!("{bus_name}.instance{}", std::process::id());
    (own_name(&connection, bus_name) || own_name(&connection, &instance)).then_some(connection)
}

/// Serves MPRIS as `bus_name` on a new thread and returns at once: a stalled
/// session bus never holds up the caller. When connecting fails the thread
/// ends and drops the receiver, so `MediaControls::publish` stops sending.
pub(super) fn spawn(bus_name: &str, target: Box<dyn MediaTarget>) -> Sender<MediaUpdate> {
    let bus_name = bus_name.to_string();
    spawn_with(move || connect(&bus_name), target)
}

pub(super) fn spawn_with<C>(connect: C, target: Box<dyn MediaTarget>) -> Sender<MediaUpdate>
where
    C: FnOnce() -> Option<Connection> + Send + 'static,
{
    let (updates_sender, updates) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("fluster-mpris".into())
        .spawn(move || {
            let Some(connection) = connect() else {
                media_trace("MPRIS is unavailable; media keys are off");
                return;
            };
            serve(&connection, build(target), &updates);
        });
    if spawned.is_err() {
        media_trace("MPRIS thread did not start; media keys are off");
    }
    updates_sender
}

fn serve(connection: &Connection, mut cr: Crossroads, updates: &Receiver<MediaUpdate>) {
    let Ok(path) = Path::new(OBJECT_PATH) else {
        return;
    };
    let channel = connection.channel();
    loop {
        if channel.read_write(Some(POLL)).is_err() {
            media_trace("MPRIS lost its D-Bus connection");
            return;
        }
        while let Some(message) = channel.pop_message() {
            // Errors here are messages that are not method calls; ignore them.
            let _ = cr.handle_message(message, connection);
        }
        loop {
            let update = match updates.try_recv() {
                Ok(update) => update,
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => return,
            };
            let Some(service) = cr.data_mut::<Service>(&path) else {
                return;
            };
            for signal in service.apply(update) {
                let _ = connection.send(signal);
            }
        }
        channel.flush();
    }
}

#[cfg(test)]
mod tests;
