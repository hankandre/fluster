// The frozen tripwire-wire.test.ts names RequestInfo, which the Node-only lib set does not declare.
type RequestInfo = Request | string;
