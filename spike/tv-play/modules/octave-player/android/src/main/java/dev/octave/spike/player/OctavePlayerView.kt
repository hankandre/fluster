package dev.octave.spike.player

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import android.util.Log
import android.view.Display
import android.view.WindowManager
import androidx.annotation.OptIn
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DecoderReuseEvaluation
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

private const val TAG = "OCTAVE_PLAY"
private const val STATS_INTERVAL_MS = 10_000L

// Hosts Media3 in a SurfaceView (PlayerView's default surface), the path Android documents for HDR.
// Every log line carries timings, formats and counters only: never a URL, header or session id.
@OptIn(UnstableApi::class)
class OctavePlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onStatus by EventDispatcher()
  private val main = Handler(Looper.getMainLooper())
  private val playerView = PlayerView(context).apply {
    useController = false
    keepScreenOn = true
  }
  private var player: ExoPlayer? = null
  private var currentUrl: String? = null
  private var droppedTotal = 0
  private var rebuffers = 0
  private var firstFrameAt = -1L
  private var playStartAt = -1L

  private val statsTick = object : Runnable {
    override fun run() {
      logStats("tick")
      main.postDelayed(this, STATS_INTERVAL_MS)
    }
  }

  init {
    addView(playerView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private fun sinceProcessStart(): Long = SystemClock.elapsedRealtime() - Process.getStartElapsedRealtime()

  private fun emit(event: String, extra: Map<String, Any?> = emptyMap()) {
    val payload = HashMap<String, Any>()
    payload["event"] = event
    payload["tMs"] = sinceProcessStart()
    for ((key, value) in extra) if (value != null) payload[key] = value
    onStatus(payload)
  }

  fun play(url: String) {
    if (url == currentUrl) return
    check(AuthenticatedHttp.isStarted()) { "play before startSession" }
    release()
    currentUrl = url
    playStartAt = sinceProcessStart()
    logDisplay("before-play")

    // The only data source: OkHttp over the shared authenticated client. The media source factory
    // is Octave's own, so ExoPlayer never builds its context-based default data sources.
    val dataSourceFactory = OkHttpDataSource.Factory(AuthenticatedHttp.client)
    val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)
    val renderers = DefaultRenderersFactory(context).setEnableDecoderFallback(true)
    val exo = ExoPlayer.Builder(context, renderers, mediaSourceFactory).build()
    player = exo
    playerView.player = exo
    exo.addAnalyticsListener(analytics)
    exo.addListener(listener)
    exo.setMediaItem(MediaItem.fromUri(url))
    exo.playWhenReady = true
    exo.prepare()
    Log.i(TAG, "T+${playStartAt}ms prepare")
    emit("prepare")
    main.postDelayed(statsTick, STATS_INTERVAL_MS)
  }

  fun release() {
    main.removeCallbacks(statsTick)
    player?.let {
      logStats("release")
      it.removeAnalyticsListener(analytics)
      it.removeListener(listener)
      it.release()
    }
    player = null
    playerView.player = null
    currentUrl = null
  }

  private fun logStats(reason: String) {
    val exo = player ?: return
    val c = exo.videoDecoderCounters
    c?.ensureUpdated()
    val line = "stats[$reason] T+${sinceProcessStart()}ms pos=${exo.currentPosition}ms " +
      "rendered=${c?.renderedOutputBufferCount} dropped=${c?.droppedBufferCount} " +
      "maxConsecDropped=${c?.maxConsecutiveDroppedBufferCount} skipped=${c?.skippedOutputBufferCount} " +
      "droppedEvents=$droppedTotal rebuffers=$rebuffers " +
      "http=${AuthenticatedHttp.requests.get()} redirects=${AuthenticatedHttp.redirectResponses.get()} " +
      "refusedOffOrigin=${AuthenticatedHttp.refusedOffOrigin.get()} refusedCredentialUrl=${AuthenticatedHttp.refusedCredentialUrl.get()}"
    Log.i(TAG, line)
    emit("stats", mapOf(
      "positionMs" to exo.currentPosition,
      "rendered" to (c?.renderedOutputBufferCount ?: 0),
      "dropped" to (c?.droppedBufferCount ?: 0),
      "rebuffers" to rebuffers,
    ))
  }

  private fun logDisplay(reason: String) {
    @Suppress("DEPRECATION")
    val display: Display? = (context.getSystemService(Context.WINDOW_SERVICE) as? WindowManager)?.defaultDisplay
    if (display == null) {
      Log.i(TAG, "display[$reason] unavailable")
      return
    }
    val caps = display.hdrCapabilities
    val types = caps?.supportedHdrTypes?.joinToString(",") { hdrTypeName(it) } ?: "none"
    val mode = display.mode
    Log.i(TAG, "display[$reason] isHdr=${display.isHdr} hdrTypes=[$types] mode=${mode.physicalWidth}x${mode.physicalHeight}@${mode.refreshRate} " +
      "maxLum=${caps?.desiredMaxLuminance}")
  }

  private fun hdrTypeName(t: Int): String = when (t) {
    Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> "DV"
    Display.HdrCapabilities.HDR_TYPE_HDR10 -> "HDR10"
    Display.HdrCapabilities.HDR_TYPE_HLG -> "HLG"
    Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS -> "HDR10+"
    else -> "type$t"
  }

  private fun describe(format: Format): String {
    val color = format.colorInfo
    return "mime=${format.sampleMimeType} codecs=${format.codecs} ${format.width}x${format.height} fps=${format.frameRate} " +
      "bitrate=${format.bitrate} color=[space=${color?.colorSpace} transfer=${color?.colorTransfer} range=${color?.colorRange} " +
      "hdrStaticInfo=${color?.hdrStaticInfo != null} lumaBits=${color?.lumaBitdepth}]"
  }

  private val listener = object : Player.Listener {
    override fun onPlaybackStateChanged(state: Int) {
      val name = when (state) {
        Player.STATE_IDLE -> "IDLE"
        Player.STATE_BUFFERING -> "BUFFERING"
        Player.STATE_READY -> "READY"
        Player.STATE_ENDED -> "ENDED"
        else -> "S$state"
      }
      if (state == Player.STATE_BUFFERING && firstFrameAt >= 0) rebuffers++
      Log.i(TAG, "T+${sinceProcessStart()}ms state=$name rebuffers=$rebuffers")
      emit("state", mapOf("state" to name))
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      Log.i(TAG, "T+${sinceProcessStart()}ms isPlaying=$isPlaying")
    }

    override fun onRenderedFirstFrame() {
      if (firstFrameAt >= 0) return
      firstFrameAt = sinceProcessStart()
      Log.i(TAG, "FIRST_FRAME T+${firstFrameAt}ms (launch to first frame), prepare to first frame ${firstFrameAt - playStartAt}ms")
      emit("firstFrame", mapOf("prepareToFirstFrameMs" to (firstFrameAt - playStartAt)))
      main.postDelayed({ logDisplay("after-first-frame") }, 3_000)
    }

    override fun onPlayerError(error: PlaybackException) {
      // The message can carry a URI, so only the code, the cause chain's classes and an HTTP status.
      val causes = generateSequence(error.cause) { it.cause }.take(5).map { it.javaClass.simpleName }.toList()
      val http = generateSequence<Throwable>(error) { it.cause }.filterIsInstance<HttpDataSource.InvalidResponseCodeException>()
        .firstOrNull()?.responseCode
      Log.e(TAG, "PLAYER_ERROR code=${error.errorCodeName} causes=$causes httpStatus=$http")
      emit("error", mapOf("code" to error.errorCodeName, "httpStatus" to http))
    }
  }

  private val analytics = object : AnalyticsListener {
    override fun onVideoDecoderInitialized(eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long) {
      Log.i(TAG, "VIDEO_DECODER name=$decoderName initMs=$initializationDurationMs")
      emit("videoDecoder", mapOf("name" to decoderName))
    }

    override fun onVideoInputFormatChanged(eventTime: AnalyticsListener.EventTime, format: Format, decoderReuseEvaluation: DecoderReuseEvaluation?) {
      Log.i(TAG, "VIDEO_FORMAT ${describe(format)}")
    }

    override fun onAudioDecoderInitialized(eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long) {
      Log.i(TAG, "AUDIO_DECODER name=$decoderName")
    }

    override fun onAudioInputFormatChanged(eventTime: AnalyticsListener.EventTime, format: Format, decoderReuseEvaluation: DecoderReuseEvaluation?) {
      Log.i(TAG, "AUDIO_FORMAT mime=${format.sampleMimeType} codecs=${format.codecs} channels=${format.channelCount} rate=${format.sampleRate} lang=${format.language}")
    }

    override fun onAudioTrackInitialized(eventTime: AnalyticsListener.EventTime, audioTrackConfig: AudioSink.AudioTrackConfig) {
      Log.i(TAG, "AUDIO_TRACK encoding=${audioTrackConfig.encoding} rate=${audioTrackConfig.sampleRate} channelConfig=${audioTrackConfig.channelConfig} tunneling=${audioTrackConfig.tunneling} offload=${audioTrackConfig.offload}")
    }

    override fun onDroppedVideoFrames(eventTime: AnalyticsListener.EventTime, droppedFrames: Int, elapsedMs: Long) {
      droppedTotal += droppedFrames
      Log.i(TAG, "DROPPED $droppedFrames in ${elapsedMs}ms total=$droppedTotal")
    }

    override fun onVideoCodecError(eventTime: AnalyticsListener.EventTime, videoCodecError: Exception) {
      Log.e(TAG, "VIDEO_CODEC_ERROR ${videoCodecError.javaClass.simpleName}")
    }
  }
}
