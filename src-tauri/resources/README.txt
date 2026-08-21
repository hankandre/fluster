The release build recipe stages the pinned libmpv runtime and its user-space
dependencies under `lib/`. Development links against the system libmpv 0.41+
development package; users never configure an executable or GPU device.
