# Workspace and business profile API implementation

Implemented endpoints on this feature branch:

- `GET /api/v1/workspaces`: returns active workspaces for the verified Clerk user.
- `POST /api/v1/workspaces`: creates a workspace and owner membership through the restricted database function.
- `GET /api/v1/workspaces/:workspaceId/business-profiles`: lists profiles only after checking active membership and setting transaction-local tenant context.
- `POST /api/v1/workspaces/:workspaceId/business-profiles`: validates and creates a profile within the active workspace.

Security boundaries:

- User identity is derived from a verified Clerk token and trusted Clerk Backend API profile, not request-body identity fields.
- Workspace membership is checked server-side.
- Business profile queries execute inside a transaction with transaction-local `dpf.user_id` and `dpf.org_id`.
- SQL values are parameterized.
- Invalid workspace IDs and malformed inputs are rejected.
- API responses do not expose database errors or connection details.

Important dependency: the main Neon schema currently uses `CHAR(1)` for country and currency code columns. A correction to `VARCHAR(2)` and `VARCHAR(3)` was tested on a temporary branch but was not approved for main. Therefore workspace/profile API integration tests and production readiness remain blocked until that correction is approved and applied.

No deployment, secret configuration, frontend cutover, or merge has occurred.
