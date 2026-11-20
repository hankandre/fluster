package dev.fluster.spike.browsecompose

import androidx.compose.ui.graphics.Color

// Same values as spike/tv-browse/src/tokens.ts (from src/styles/tokens.css and DESIGN.md §6).
object Palette {
  val surface0 = Color(0xFF0B0C0E)
  val surface2 = Color(0xFF1B1C20)
  val text1 = Color(0xFFF2EFE9)
  val text2 = Color(0xFFA9A59D)
  val onLight = Color(0xFF0B0C0E)
  val focus = Color(0xFFFFF4DC)
  val railScrim = Color(0xB80B0C0E) // rgba(11,12,14,0.72)
}

// Design units are px on the 1920x1080 TV canvas (DESIGN.md §6).
object Design {
  const val posterW = 248f
  const val cardGap = 24f
  const val rowGap = 48f
  const val railCollapsedW = 88f // owner decision 2026-11-20: collapsed rail, 72-96 px at 1080p
  const val railExpandedW = 300f
  const val typeDisplay = 64f
  const val typeHeading = 33f
  const val typeBody = 28f
  const val typeLabel = 24f
  const val radiusArt = 6f
  const val radiusControl = 10f
  const val lift = 1.08f
  const val dwellMs = 300L
  const val crossfadeMs = 300
}
