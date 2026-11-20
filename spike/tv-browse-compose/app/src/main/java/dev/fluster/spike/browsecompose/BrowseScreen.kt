// Browse baseline for decision 0003/0004: the React Native spike's Home screen in Compose for TV.
// A first pass as an experienced Compose for TV developer would write it: tv-material
// ModalNavigationDrawer for the collapsed rail, LazyColumn of LazyRows with focusRestorer,
// tv-material Card for the focus lift, Coil 3 with sized requests. No row-end traps, no
// custom BringIntoViewSpec, no baseline profile of our own.
package dev.fluster.spike.browsecompose

import android.util.Log
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.DrawerValue
import androidx.tv.material3.Icon
import androidx.tv.material3.ModalNavigationDrawer
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import androidx.tv.material3.rememberDrawerState
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest

// Logcat tag the falsifier reads (`run-falsifier.sh` passes it as --tag).
const val TAG = "FlusterBrowse"

/** Scales design px on the 1920 canvas to the window, like the React Native spike's u(). */
@Stable
class Units(private val widthDp: Float) {
  fun dp(px: Float): Dp = (px * widthDp / 1920f).dp
  fun sp(px: Float, fontScale: Float): TextUnit = (px * widthDp / 1920f / fontScale).sp
}

/** Hero target; written on card focus, read only by the hero, so rows never recompose on focus. */
@Stable
class HeroState {
  var focused by mutableStateOf(0 to 0)
}

private val RAIL = listOf(
  "Home" to Icons.Filled.Home,
  "Search" to Icons.Filled.Search,
  "Movies" to Icons.Filled.Star,
  "Shows" to Icons.Filled.List,
  "Settings" to Icons.Filled.Settings,
)

@Composable
fun BrowseScreen() {
  val config = LocalConfiguration.current
  val fontScale = LocalDensity.current.fontScale
  val u = remember(config.screenWidthDp) { Units(config.screenWidthDp.toFloat()) }
  val hero = remember { HeroState() }
  val railFirst = remember { FocusRequester() }
  val drawer = rememberDrawerState(DrawerValue.Closed)

  LaunchedEffect(Unit) {
    // Closest analogue of the React Native spike's first-commit BOOT line.
    Log.i(TAG, "BOOT compose window=${config.screenWidthDp}x${config.screenHeightDp}dp posters=$POSTERS backdrops=$BACKDROPS rows=$ROWS cols=$COLS")
    railFirst.requestFocus()
  }

  Box(Modifier.fillMaxSize().background(Palette.surface0)) {
    Hero(hero, u, fontScale)
    ModalNavigationDrawer(
      drawerState = drawer,
      drawerContent = { value -> Rail(value, u, fontScale, railFirst) },
    ) {
      Content(hero, u, fontScale, Modifier.padding(start = u.dp(Design.railCollapsedW)))
    }
  }
}

@Composable
private fun Hero(state: HeroState, u: Units, fontScale: Float) {
  var shown by remember { mutableStateOf(0 to 0) }
  LaunchedEffect(state) {
    // 300 ms dwell: only the last focus inside the window updates the hero.
    snapshotFlow { state.focused }.collectLatest {
      delay(Design.dwellMs)
      shown = it
    }
  }
  val context = LocalContext.current
  val config = LocalConfiguration.current
  val density = LocalDensity.current
  val w = with(density) { config.screenWidthDp.dp.roundToPx() }
  val h = with(density) { config.screenHeightDp.dp.roundToPx() }
  Crossfade(targetState = shown, animationSpec = tween(Design.crossfadeMs), label = "backdrop") { (r, c) ->
    AsyncImage(
      model = ImageRequest.Builder(context).data(backdropUrl(r, c)).size(w, h).build(),
      contentDescription = null,
      contentScale = ContentScale.Crop,
      modifier = Modifier.fillMaxSize(),
    )
  }
  Box(Modifier.fillMaxSize().background(Palette.surface0.copy(alpha = 0.55f)))
  Column(
    Modifier
      .padding(start = u.dp(Design.railCollapsedW + 24f), top = u.dp(54f + 60f))
      .width(u.dp(900f)),
  ) {
    Text(titleOf(shown.first, shown.second), color = Palette.text1, fontSize = u.sp(Design.typeDisplay, fontScale), fontWeight = FontWeight.Bold)
    Text(
      "2026 · 1 h 58 min · 4K · Synthetic art",
      color = Palette.text2,
      fontSize = u.sp(Design.typeBody, fontScale),
      modifier = Modifier.padding(top = u.dp(16f)),
    )
  }
}

@Composable
private fun Rail(value: DrawerValue, u: Units, fontScale: Float, first: FocusRequester) {
  val open = value == DrawerValue.Open
  Column(
    Modifier
      .fillMaxHeight()
      .width(u.dp(if (open) Design.railExpandedW else Design.railCollapsedW))
      .background(Palette.railScrim)
      .padding(top = u.dp(54f + 40f), start = u.dp(12f), end = u.dp(12f))
      .focusRestorer(first),
    verticalArrangement = Arrangement.spacedBy(u.dp(8f)),
  ) {
    RAIL.forEachIndexed { i, (label, icon) ->
      // key(): focusRestorer tells children apart by composite key hash.
      key(label) { RailItem(i, label, icon, open, u, fontScale, if (i == 0) Modifier.focusRequester(first) else Modifier) }
    }
  }
}

@Composable
private fun RailItem(index: Int, label: String, icon: ImageVector, open: Boolean, u: Units, fontScale: Float, modifier: Modifier) {
  val focused = remember { booleanArrayOf(false) }
  Surface(
    onClick = {},
    modifier = modifier
      .fillMaxWidth()
      .height(u.dp(64f))
      .onFocusChanged {
        if (it.isFocused != focused[0]) {
          focused[0] = it.isFocused
          Log.i(TAG, "${if (it.isFocused) "FOCUS" else "BLUR"} rail,$index")
        }
      },
    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(u.dp(Design.radiusControl))),
    colors = ClickableSurfaceDefaults.colors(
      containerColor = Palette.surface0.copy(alpha = 0f),
      contentColor = Palette.text2,
      focusedContainerColor = Palette.text1,
      focusedContentColor = Palette.onLight,
    ),
    scale = ClickableSurfaceDefaults.scale(focusedScale = 1f),
  ) {
    Row(Modifier.fillMaxSize().padding(start = u.dp(20f)), verticalAlignment = Alignment.CenterVertically) {
      Icon(icon, contentDescription = label, modifier = Modifier.size(u.dp(40f)))
      if (open) {
        Spacer(Modifier.width(u.dp(20f)))
        Text(label, fontSize = u.sp(Design.typeLabel, fontScale), fontWeight = FontWeight.SemiBold, maxLines = 1)
      }
    }
  }
}

@Composable
private fun Content(hero: HeroState, u: Units, fontScale: Float, modifier: Modifier) {
  val config = LocalConfiguration.current
  LazyColumn(
    modifier = modifier
      .fillMaxSize()
      .padding(top = (config.screenHeightDp * 0.42f).dp)
      .focusRestorer(),
    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = u.dp(54f)),
  ) {
    items(ROWS, key = { it }) { row -> BrowseRow(row, hero, u, fontScale) }
  }
}

@Composable
private fun BrowseRow(row: Int, hero: HeroState, u: Units, fontScale: Float) {
  val posterW = u.dp(Design.posterW)
  val posterH = posterW * 1.5f
  Column(Modifier.height(u.dp(Design.typeHeading + 16f + Design.rowGap) + posterH * 1.12f)) {
    Text(
      rowTitle(row),
      color = Palette.text1,
      fontSize = u.sp(Design.typeHeading, fontScale),
      fontWeight = FontWeight.SemiBold,
      modifier = Modifier.padding(start = u.dp(24f), bottom = u.dp(16f)),
    )
    LazyRow(
      modifier = Modifier.height(posterH * 1.12f).focusRestorer(),
      contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = u.dp(24f)),
      horizontalArrangement = Arrangement.spacedBy(u.dp(Design.cardGap)),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      items(COLS, key = { it }) { col -> PosterCard(row, col, posterW, posterH, hero, u) }
    }
  }
}

@Composable
private fun PosterCard(row: Int, col: Int, w: Dp, h: Dp, hero: HeroState, u: Units) {
  val focused = remember { booleanArrayOf(false) }
  val context = LocalContext.current
  val density = LocalDensity.current
  val request = remember(row, col) {
    with(density) {
      ImageRequest.Builder(context).data(posterUrl(row, col)).size(w.roundToPx(), h.roundToPx()).build()
    }
  }
  Card(
    onClick = {},
    modifier = Modifier
      .size(w, h)
      .onFocusChanged {
        if (it.isFocused != focused[0]) {
          focused[0] = it.isFocused
          if (it.isFocused) {
            Log.i(TAG, "FOCUS $row,$col")
            hero.focused = row to col
          } else {
            Log.i(TAG, "BLUR $row,$col")
          }
        }
      },
    shape = CardDefaults.shape(RoundedCornerShape(u.dp(Design.radiusArt))),
    colors = CardDefaults.colors(containerColor = Palette.surface2),
    scale = CardDefaults.scale(focusedScale = Design.lift),
    border = CardDefaults.border(
      focusedBorder = Border(BorderStroke(u.dp(3f), Palette.focus), shape = RoundedCornerShape(u.dp(Design.radiusArt))),
    ),
  ) {
    AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
  }
}
