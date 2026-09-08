import "./ores.tsp";
using Ores;

namespace Hhaus.Platform.V1;

// TypeSpec does not provide a built-in UUID scalar. The independent contract
// parser recognizes this nominal scalar and the compiler verifies its use.
scalar uuid extends string;

enum OrganizationStatus {
  Pending: "pending",
  Active: "active",
  Suspended: "suspended",
  Closed: "closed",
}

enum AccountKind {
  Individual: "individual",
  OrganizationMember: "organization_member",
  Service: "service",
}

enum AccountStatus {
  Pending: "pending",
  Active: "active",
  Suspended: "suspended",
  Closed: "closed",
}

enum SpaceKind {
  Bedroom: "bedroom",
  Bed: "bed",
  Desk: "desk",
  MeetingRoom: "meeting_room",
  CommonArea: "common_area",
  Entrance: "entrance",
  Storage: "storage",
  Parking: "parking",
}

enum ReservationStatus {
  Requested: "requested",
  Held: "held",
  Confirmed: "confirmed",
  CheckedIn: "checked_in",
  CheckedOut: "checked_out",
  Completed: "completed",
  Cancelled: "cancelled",
  Expired: "expired",
  NoShow: "no_show",
}

enum ReservationTransitionKind {
  RequestedToHeld: "requested_to_held",
  RequestedToConfirmed: "requested_to_confirmed",
  RequestedToCancelled: "requested_to_cancelled",
  HeldToConfirmed: "held_to_confirmed",
  HeldToCancelled: "held_to_cancelled",
  HeldToExpired: "held_to_expired",
  ConfirmedToCheckedIn: "confirmed_to_checked_in",
  ConfirmedToCancelled: "confirmed_to_cancelled",
  ConfirmedToNoShow: "confirmed_to_no_show",
  CheckedInToCheckedOut: "checked_in_to_checked_out",
  CheckedOutToCompleted: "checked_out_to_completed",
}

enum GuestPassStatus {
  Planned: "planned",
  Issued: "issued",
  CheckedIn: "checked_in",
  CheckedOut: "checked_out",
  Revoked: "revoked",
  Expired: "expired",
  Cancelled: "cancelled",
}

enum GuestPassTransitionKind {
  PlannedToIssued: "planned_to_issued",
  PlannedToCancelled: "planned_to_cancelled",
  IssuedToCheckedIn: "issued_to_checked_in",
  IssuedToRevoked: "issued_to_revoked",
  IssuedToExpired: "issued_to_expired",
  IssuedToCancelled: "issued_to_cancelled",
  CheckedInToCheckedOut: "checked_in_to_checked_out",
  CheckedInToRevoked: "checked_in_to_revoked",
}

enum VisitStatus {
  Expected: "expected",
  CheckedIn: "checked_in",
  CheckedOut: "checked_out",
  Denied: "denied",
  Cancelled: "cancelled",
}

enum VisitTransitionKind {
  ExpectedToCheckedIn: "expected_to_checked_in",
  ExpectedToDenied: "expected_to_denied",
  ExpectedToCancelled: "expected_to_cancelled",
  CheckedInToCheckedOut: "checked_in_to_checked_out",
}

enum AccessGrantStatus {
  Pending: "pending",
  Active: "active",
  Expired: "expired",
  Revoked: "revoked",
  Denied: "denied",
}

enum AccessGrantTransitionKind {
  PendingToActive: "pending_to_active",
  PendingToRevoked: "pending_to_revoked",
  PendingToExpired: "pending_to_expired",
  PendingToDenied: "pending_to_denied",
  ActiveToRevoked: "active_to_revoked",
  ActiveToExpired: "active_to_expired",
}

enum AccessDecisionOutcome {
  Allowed: "allowed",
  Denied: "denied",
}

enum AccessDecisionReason {
  MatchingActiveGrant: "matching_active_grant",
  NoMatchingGrant: "no_matching_grant",
  GrantNotActive: "grant_not_active",
  OutsideValidityWindow: "outside_validity_window",
  SpaceMismatch: "space_mismatch",
  PrincipalMismatch: "principal_mismatch",
  MembershipDenied: "membership_denied",
  IdentityUnavailable: "identity_unavailable",
  PolicyUnavailable: "policy_unavailable",
  EvidenceInvalid: "evidence_invalid",
  Replayed: "replayed",
  RateLimited: "rate_limited",
}

enum NetworkCredentialStatus {
  Pending: "pending",
  Active: "active",
  Expired: "expired",
  Revoked: "revoked",
}

enum MaintenancePriority {
  Low: "low",
  Normal: "normal",
  High: "high",
  Urgent: "urgent",
}

enum MaintenanceStatus {
  Open: "open",
  Acknowledged: "acknowledged",
  InProgress: "in_progress",
  Resolved: "resolved",
  Cancelled: "cancelled",
}

enum HousekeepingStatus {
  Scheduled: "scheduled",
  InProgress: "in_progress",
  Completed: "completed",
  Skipped: "skipped",
  Cancelled: "cancelled",
}

enum SecurityObservationKind {
  AccessAttempt: "access_attempt",
  DoorHeldOpen: "door_held_open",
  OccupancyAnomaly: "occupancy_anomaly",
  CameraAlert: "camera_alert",
  NetworkAnomaly: "network_anomaly",
  SafetyAlert: "safety_alert",
}

enum SecurityDisposition {
  Unreviewed: "unreviewed",
  Benign: "benign",
  Escalated: "escalated",
  Resolved: "resolved",
  Dismissed: "dismissed",
}

@Ores.table("hhm_locations")
@Ores.unique("tenantId,slug")
model Location {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @maxLength(80) slug: string;
  @maxLength(120) displayName: string;
  @maxLength(120) city: string;
  @maxLength(2) countryCode: string;
  @maxLength(64) timeZone: string;
  active: boolean;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_organizations")
@Ores.unique("tenantId")
@Ores.unique("slug")
@Ores.index("status")
model Organization {
  @key id: uuid;
  @maxLength(128) tenantId: string;
  @maxLength(80) slug: string;
  @maxLength(160) displayName: string;
  status: OrganizationStatus;
  seatLimit: int32;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_accounts")
@Ores.unique("tenantId,authSubject")
@Ores.index("tenantId,organizationId,status")
model Account {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @maxLength(255) authSubject: string;
  kind: AccountKind;
  status: AccountStatus;
  @Ores.references("Organization.id") organizationId?: uuid;
  @maxLength(160) displayName?: string;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_bookable_spaces")
@Ores.unique("tenantId,locationId,code")
@Ores.index("tenantId,locationId,kind,active")
model Space {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @maxLength(64) code: string;
  @maxLength(160) displayName: string;
  kind: SpaceKind;
  capacity: int32;
  active: boolean;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_reservations")
@Ores.unique("tenantId,idempotencyKey")
@Ores.index("tenantId,spaceId,startsAt,endsAt")
@Ores.index("tenantId,bookedByAccountId,status")
@Ores.index("tenantId,organizationId,status")
model Reservation {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId: uuid;
  @Ores.references("Account.id") bookedByAccountId: uuid;
  @Ores.references("Organization.id") organizationId?: uuid;
  status: ReservationStatus;
  startsAt: utcDateTime;
  endsAt: utcDateTime;
  occupantCount: int32;
  guestCount: int32;
  @maxLength(128) idempotencyKey: string;
  version: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_reservation_transitions")
@Ores.unique("tenantId,idempotencyKey")
@Ores.index("tenantId,reservationId,occurredAt")
model ReservationTransition {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Reservation.id") reservationId: uuid;
  kind: ReservationTransitionKind;
  expectedVersion: int64;
  @Ores.references("Account.id") actorAccountId: uuid;
  @maxLength(128) idempotencyKey: string;
  @maxLength(64) reasonCode: string;
  occurredAt: utcDateTime;
}

@Ores.table("hhm_guest_passes")
@Ores.unique("tenantId,reservationId,guestReference")
@Ores.index("tenantId,reservationId,status")
model GuestPass {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Reservation.id") reservationId: uuid;
  @Ores.references("Account.id") issuedByAccountId: uuid;
  @maxLength(128) guestReference: string;
  @maxLength(160) guestDisplayName?: string;
  @maxLength(128) guestContactDigest?: string;
  status: GuestPassStatus;
  validFrom: utcDateTime;
  validUntil: utcDateTime;
  @maxLength(128) credentialReferenceDigest?: string;
  version: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_guest_pass_transitions")
@Ores.unique("tenantId,idempotencyKey")
@Ores.index("tenantId,guestPassId,occurredAt")
model GuestPassTransition {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("GuestPass.id") guestPassId: uuid;
  kind: GuestPassTransitionKind;
  expectedVersion: int64;
  @Ores.references("Account.id") actorAccountId: uuid;
  @maxLength(128) idempotencyKey: string;
  @maxLength(64) reasonCode: string;
  occurredAt: utcDateTime;
}

@Ores.table("hhm_visits")
@Ores.index("tenantId,locationId,status,expectedAt")
@Ores.index("tenantId,guestPassId,status")
model Visit {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Reservation.id") reservationId?: uuid;
  @Ores.references("GuestPass.id") guestPassId?: uuid;
  @Ores.references("Account.id") accountId?: uuid;
  status: VisitStatus;
  expectedAt?: utcDateTime;
  checkedInAt?: utcDateTime;
  checkedOutAt?: utcDateTime;
  @maxLength(64) verificationMethod: string;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_visit_transitions")
@Ores.unique("tenantId,idempotencyKey")
@Ores.index("tenantId,visitId,occurredAt")
model VisitTransition {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Visit.id") visitId: uuid;
  kind: VisitTransitionKind;
  expectedVersion: int64;
  @Ores.references("Account.id") actorAccountId: uuid;
  @maxLength(128) idempotencyKey: string;
  @maxLength(64) reasonCode: string;
  occurredAt: utcDateTime;
}

@Ores.table("hhm_access_grants")
@Ores.index("tenantId,locationId,status,validUntil")
@Ores.index("tenantId,accountId,status")
@Ores.index("tenantId,guestPassId,status")
model AccessGrant {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId: uuid;
  @Ores.references("Account.id") accountId?: uuid;
  @Ores.references("GuestPass.id") guestPassId?: uuid;
  @Ores.references("Reservation.id") reservationId?: uuid;
  status: AccessGrantStatus;
  validFrom: utcDateTime;
  validUntil: utcDateTime;
  @maxLength(128) providerReferenceDigest?: string;
  version: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_access_grant_transitions")
@Ores.unique("tenantId,idempotencyKey")
@Ores.index("tenantId,accessGrantId,occurredAt")
model AccessGrantTransition {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("AccessGrant.id") accessGrantId: uuid;
  kind: AccessGrantTransitionKind;
  expectedVersion: int64;
  @Ores.references("Account.id") actorAccountId: uuid;
  @maxLength(128) idempotencyKey: string;
  @maxLength(64) reasonCode: string;
  occurredAt: utcDateTime;
}

@Ores.table("hhm_access_decisions")
@Ores.unique("tenantId,requestId")
@Ores.index("tenantId,locationId,spaceId,occurredAt")
@Ores.index("tenantId,accountId,occurredAt")
@Ores.index("tenantId,guestPassId,occurredAt")
model AccessDecision {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId: uuid;
  @Ores.references("Account.id") accountId?: uuid;
  @Ores.references("GuestPass.id") guestPassId?: uuid;
  @Ores.references("AccessGrant.id") accessGrantId?: uuid;
  outcome: AccessDecisionOutcome;
  reason: AccessDecisionReason;
  @maxLength(64) evidenceDigestSha256: string;
  @maxLength(64) policyVersion: string;
  @maxLength(128) requestId: string;
  occurredAt: utcDateTime;
}

@Ores.table("hhm_network_credentials")
@Ores.index("tenantId,locationId,status,validUntil")
@Ores.index("tenantId,accountId,status")
model NetworkCredential {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Account.id") accountId: uuid;
  @Ores.references("Reservation.id") reservationId?: uuid;
  status: NetworkCredentialStatus;
  @maxLength(64) profileName: string;
  @maxLength(128) providerReferenceDigest: string;
  validFrom: utcDateTime;
  validUntil: utcDateTime;
  version: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_maintenance_tickets")
@Ores.index("tenantId,locationId,status,priority")
@Ores.index("tenantId,assignedToAccountId,status")
model MaintenanceTicket {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId?: uuid;
  @Ores.references("Account.id") reportedByAccountId: uuid;
  @Ores.references("Account.id") assignedToAccountId?: uuid;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  @maxLength(200) summary: string;
  @maxLength(4000) description?: string;
  openedAt: utcDateTime;
  resolvedAt?: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_housekeeping_tasks")
@Ores.index("tenantId,locationId,status,scheduledFrom")
@Ores.index("tenantId,assignedToAccountId,status")
model HousekeepingTask {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId: uuid;
  @Ores.references("Reservation.id") reservationId?: uuid;
  @Ores.references("Account.id") assignedToAccountId?: uuid;
  status: HousekeepingStatus;
  scheduledFrom: utcDateTime;
  scheduledUntil: utcDateTime;
  completedAt?: utcDateTime;
  @maxLength(2000) checklistSummary?: string;
  version: int64;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

@Ores.table("hhm_security_observations")
@Ores.index("tenantId,locationId,disposition,occurredAt")
@Ores.index("tenantId,kind,occurredAt")
model SecurityObservation {
  @key id: uuid;
  @maxLength(128) @Ores.references("Organization.tenantId") tenantId: string;
  @Ores.references("Location.id") locationId: uuid;
  @Ores.references("Space.id") spaceId?: uuid;
  @Ores.references("AccessGrant.id") accessGrantId?: uuid;
  @Ores.references("Visit.id") visitId?: uuid;
  kind: SecurityObservationKind;
  disposition: SecurityDisposition;
  occurredAt: utcDateTime;
  @maxLength(128) sensorReferenceDigest: string;
  @maxLength(512) summary?: string;
  containsSensitiveMedia: boolean;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}
