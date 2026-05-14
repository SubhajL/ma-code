export interface AuthSession {
  status: "unauthenticated";
  actorId: null;
  authMode: "placeholder";
}

export interface AuthSessionBoundary {
  authMode: "placeholder";
  configSource: "runtime";
  sessionPersistence: "disabled";
}

const AUTH_SESSION: AuthSession = {
  status: "unauthenticated",
  actorId: null,
  authMode: "placeholder",
};

const AUTH_SESSION_BOUNDARY: AuthSessionBoundary = {
  authMode: "placeholder",
  configSource: "runtime",
  sessionPersistence: "disabled",
};

export function getAuthSession(): AuthSession {
  return { ...AUTH_SESSION };
}

export function describeAuthSessionBoundary(): AuthSessionBoundary {
  return { ...AUTH_SESSION_BOUNDARY };
}
