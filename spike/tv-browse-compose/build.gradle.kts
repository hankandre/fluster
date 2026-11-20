// AGP 9 builds Kotlin itself (built-in Kotlin) with KGP 2.2.10. The libraries below ship
// Kotlin 2.4 metadata, so KGP is raised to 2.4.21 on the build classpath.
buildscript {
  dependencies {
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
  }
}
plugins {
  id("com.android.application") version "9.5.2" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.4.21" apply false
}
