plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.plugin.compose")
}

android {
  namespace = "dev.fluster.spike.browsecompose"
  compileSdk { version = release(37) { minorApiLevel = 1 } }

  defaultConfig {
    applicationId = "dev.fluster.spike.browsecompose"
    minSdk = 24
    targetSdk = 36
    versionCode = 1
    versionName = "0.0.1-spike"
    ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
      // Throwaway spike: signed with the local debug key, like the React Native spike.
      signingConfig = signingConfigs.getByName("debug")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures { compose = true }
}

dependencies {
  implementation(platform("androidx.compose:compose-bom:2026.11.01"))
  implementation("androidx.compose.foundation:foundation")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.material:material-icons-core")
  implementation("androidx.tv:tv-material:1.1.0")
  implementation("androidx.activity:activity-compose:1.13.0")
  implementation("io.coil-kt.coil3:coil-compose:3.6.3")
  implementation("io.coil-kt.coil3:coil-network-okhttp:3.6.3")
}
