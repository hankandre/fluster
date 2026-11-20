package dev.octave.spike.player

import android.util.Log
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import java.io.IOException
import java.net.Proxy
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

// The one HTTP client for every native request (decision 0003, "Decision (accepted)" item 6).
// Redirects are never followed, no proxy is used, the Authorization header is added here and only
// here, and a request to any origin but the session's is refused before it leaves the device.
object AuthenticatedHttp {
  private const val TAG = "OCTAVE_HTTP"

  private class Session(val origin: HttpUrl, val authorization: String, val token: String)

  @Volatile
  private var session: Session? = null

  val requests = AtomicInteger()
  val refusedOffOrigin = AtomicInteger()
  val refusedCredentialUrl = AtomicInteger()
  val redirectResponses = AtomicInteger()

  val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .followRedirects(false)
      .followSslRedirects(false)
      .proxy(Proxy.NO_PROXY)
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .addInterceptor(SessionInterceptor)
      .build()
  }

  // The header is held in memory only and never logged or returned. Called once per JS start: a recreated activity re-runs the JS flow in the same process and signs in
  // again, so a repeat start for the same origin replaces the header; another origin is refused.
  @Synchronized
  fun start(originText: String, authorization: String) {
    val origin = originText.toHttpUrlOrNull() ?: throw IllegalArgumentException("invalid origin")
    require(origin.username.isEmpty() && origin.password.isEmpty()) { "origin carries credentials" }
    require(origin.encodedPath == "/" && origin.query == null && origin.fragment == null) { "origin is not bare" }
    val token = Regex("""Token="([^"]+)"""").find(authorization)?.groupValues?.get(1)
      ?: throw IllegalArgumentException("authorization has no token")
    val previous = session
    check(previous == null || previous.origin == origin) { "A session for another origin is already active." }
    session = Session(origin, authorization, token)
    Log.i(TAG, if (previous == null) "session started (scheme=${origin.scheme})" else "session restarted for the same origin")
  }

  fun isStarted(): Boolean = session != null

  private val credentialParams = setOf("api_key", "apikey", "x-emby-token", "x-mediabrowser-token", "token", "accesstoken")

  private object SessionInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
      val s = session ?: throw IOException("Octave has no session; request refused")
      val url = chain.request().url
      if (url.scheme != s.origin.scheme || url.host != s.origin.host || url.port != s.origin.port) {
        refusedOffOrigin.incrementAndGet()
        Log.w(TAG, "refused a request to another origin (count=${refusedOffOrigin.get()})")
        throw IOException("Octave refused a request to another origin")
      }
      val hasCredentialParam = url.queryParameterNames.any { it.lowercase() in credentialParams }
      if (hasCredentialParam || url.toString().contains(s.token) || url.username.isNotEmpty() || url.password.isNotEmpty()) {
        refusedCredentialUrl.incrementAndGet()
        Log.w(TAG, "refused a URL that carries a credential (count=${refusedCredentialUrl.get()})")
        throw IOException("Octave refused a URL that carries a credential")
      }
      requests.incrementAndGet()
      val response = chain.proceed(chain.request().newBuilder().header("Authorization", s.authorization).build())
      if (response.code in 300..399) {
        redirectResponses.incrementAndGet()
        Log.w(TAG, "received a redirect (${response.code}); not followed")
      }
      return response
    }
  }
}
