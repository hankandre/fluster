package dev.octave.spike.player

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import okhttp3.Request
import java.io.IOException

private const val TAG = "OCTAVE_PLAY"

private val LAUNCH_KEYS = listOf("server", "user", "pass", "title", "year", "canary")

private var launchConfig: Map<String, String>? = null

class OctavePlayerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OctavePlayer")

    // Run-time inputs from `am start --es octave.<key> ...`, removed from the intent once read and
    // never logged. Held in memory per process, so a recreated activity (whose new intent still
    // carries the extras) gets the same config.
    Function("takeLaunchConfig") {
      launchConfig?.let {
        Log.i(TAG, "launch config reused (activity recreated)")
        return@Function it
      }
      val intent = appContext.currentActivity?.intent ?: return@Function emptyMap<String, String>()
      val config = mutableMapOf<String, String>()
      for (key in LAUNCH_KEYS) {
        intent.getStringExtra("octave.$key")?.let { config[key] = it }
        intent.removeExtra("octave.$key")
      }
      Log.i(TAG, "launch config keys: ${config.keys.sorted()}")
      if (config.isNotEmpty()) launchConfig = config
      config
    }

    // The hand-over of the Authorization header (and so the token) to native code, once per JS start.
    Function("startSession") { origin: String, authorization: String ->
      AuthenticatedHttp.start(origin, authorization)
    }

    // Redirect and origin checks through the shared client, against the recording proxy's probe
    // endpoints. Returns status codes and booleans only, never a URL.
    AsyncFunction("runNativeProbes") { origin: String, canaryOrigin: String ->
      val client = AuthenticatedHttp.client
      fun status(url: String): Int = try {
        client.newCall(Request.Builder().url(url).build()).execute().use { it.code }
      } catch (e: IOException) {
        -1
      }
      val sameOrigin = status("$origin/__octave_probe/redirect-same")
      val toCanary = status("$origin/__octave_probe/redirect-canary")
      val refusedBefore = AuthenticatedHttp.refusedOffOrigin.get()
      val direct = status("$canaryOrigin/__canary/direct")
      val credentialBefore = AuthenticatedHttp.refusedCredentialUrl.get()
      val apiKey = status("$origin/__octave_probe/plain?api_key=probe")
      val result = mapOf(
        "redirectSameStatus" to sameOrigin,
        "redirectCanaryStatus" to toCanary,
        "offOriginStatus" to direct,
        "offOriginRefused" to (AuthenticatedHttp.refusedOffOrigin.get() == refusedBefore + 1),
        "apiKeyUrlRefused" to (apiKey == -1 && AuthenticatedHttp.refusedCredentialUrl.get() == credentialBefore + 1),
      )
      Log.i(TAG, "native probes $result")
      result
    }

    View(OctavePlayerView::class) {
      Events("onStatus")
      Prop("url") { view: OctavePlayerView, url: String ->
        view.play(url)
      }
      OnViewDestroys { view: OctavePlayerView ->
        view.release()
      }
    }
  }
}
