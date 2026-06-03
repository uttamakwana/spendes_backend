/**
 * Coarse-grained authorization roles.
 * Fine-grained, resource-level permissions (e.g. group membership) are handled
 * inside the owning feature module — this is only the top-level RBAC layer.
 */
export enum Role {
  User = 'user',
  Admin = 'admin',
}
