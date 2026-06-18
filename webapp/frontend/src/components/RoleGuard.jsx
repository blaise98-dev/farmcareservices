/**
 * RoleGuard — conditionally renders children based on a permission check.
 *
 * Usage:
 *   <RoleGuard allowed={p.canLogMilk}>
 *     <button>Add milk record</button>
 *   </RoleGuard>
 *
 *   // With a fallback message:
 *   <RoleGuard allowed={p.canUpdateHealthStatus} fallback={<span>Read-only</span>}>
 *     <HealthEditor />
 *   </RoleGuard>
 *
 *   // Full page redirect variant (for route-level guarding):
 *   <RoleGuard allowed={p.canViewEconomics} redirect="/" />
 */
import { Navigate } from 'react-router-dom';

export default function RoleGuard({ allowed, children, fallback = null, redirect = null }) {
  if (allowed) return children;
  if (redirect) return <Navigate to={redirect} replace />;
  return fallback;
}
