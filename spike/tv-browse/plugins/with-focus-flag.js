// Config plugin for the falsifier: lets one prebuild produce both arms of the
// react-native-tvos #1087 experiment. `./gradlew assembleRelease -PfocusClipped=true`
// force-overrides ReactNativeFeatureFlags.enableCustomFocusSearchOnClippedElementsAndroid
// to true after loadReactNative(); the default build leaves it at the shipped default.
// The effective value is logged to logcat under FLUSTER_FLAG.
const { withAppBuildGradle, withMainApplication } = require("expo/config-plugins");

const FIELD = `buildConfigField "boolean", "FOCUS_CLIPPED", (project.findProperty("focusClipped") ?: "false")`;

module.exports = function withFocusFlag(config) {
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes("FOCUS_CLIPPED")) {
      c.modResults.contents = c.modResults.contents.replace(/defaultConfig\s*\{/, (m) => `${m}\n        ${FIELD}`);
      if (!/buildFeatures\s*\{[^}]*buildConfig\s+true/.test(c.modResults.contents)) {
        c.modResults.contents = c.modResults.contents.replace(/android\s*\{/, (m) => `${m}\n    buildFeatures { buildConfig true }`);
      }
    }
    return c;
  });
  config = withMainApplication(config, (c) => {
    let src = c.modResults.contents;
    if (src.includes("FLUSTER_FLAG")) return c;
    src = src.replace(
      "import android.app.Application",
      [
        "import android.app.Application",
        "import android.util.Log",
        "import com.facebook.react.internal.featureflags.ReactNativeFeatureFlags",
        "import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsProvider",
        "import com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android",
      ].join("\n"),
    );
    src = src.replace(
      /loadReactNative\(this\)/,
      `loadReactNative(this)
    if (BuildConfig.FOCUS_CLIPPED) {
      val accessed = ReactNativeFeatureFlags.dangerouslyForceOverride(
        object : ReactNativeFeatureFlagsProvider by ReactNativeFeatureFlagsOverrides_RNOSS_Stable_Android() {
          override fun enableCustomFocusSearchOnClippedElementsAndroid(): Boolean = true
        })
      Log.i("FLUSTER_FLAG", "forced override; flags read before override: $accessed")
    }
    Log.i("FLUSTER_FLAG", "enableCustomFocusSearchOnClippedElementsAndroid=" + ReactNativeFeatureFlags.enableCustomFocusSearchOnClippedElementsAndroid())`,
    );
    c.modResults.contents = src;
    return c;
  });
  return config;
};
