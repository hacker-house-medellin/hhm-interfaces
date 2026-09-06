import "@typespec/json-schema";

using TypeSpec.JsonSchema;

namespace HHaus.ResidentOperations.V1;

@id("ActorRole")
enum ActorRole {
  resident: "resident",
  guest: "guest",
  house_manager: "house_manager",
  owner: "owner",
  administrator: "administrator",
  developer: "developer",
}

@id("GuestVisitStatus")
enum GuestVisitStatus {
  invited: "invited",
  checked_in: "checked_in",
  checked_out: "checked_out",
  revoked: "revoked",
  expired: "expired",
}

@id("ResourceKind")
enum ResourceKind {
  room: "room",
  bed: "bed",
  desk: "desk",
  kitchen: "kitchen",
  dining_table: "dining_table",
  meeting_room: "meeting_room",
  event_space: "event_space",
  laundry: "laundry",
  parking: "parking",
}

@id("ReservationStatus")
enum ReservationStatus {
  requested: "requested",
  confirmed: "confirmed",
  waitlisted: "waitlisted",
  canceled: "canceled",
  completed: "completed",
  no_show: "no_show",
}

@id("MealPlanStatus")
enum MealPlanStatus {
  draft: "draft",
  open: "open",
  confirmed: "confirmed",
  canceled: "canceled",
  completed: "completed",
}

@id("PollStatus")
enum PollStatus {
  draft: "draft",
  open: "open",
  closed: "closed",
  canceled: "canceled",
}

@id("VoteVisibility")
enum VoteVisibility {
  named: "named",
  anonymous_to_members: "anonymous_to_members",
  secret_until_close: "secret_until_close",
}

@id("InvoiceStatus")
enum InvoiceStatus {
  draft: "draft",
  open: "open",
  paid: "paid",
  partially_refunded: "partially_refunded",
  refunded: "refunded",
  void: "void",
  disputed: "disputed",
}

@id("PaymentStatus")
enum PaymentStatus {
  requires_action: "requires_action",
  processing: "processing",
  succeeded: "succeeded",
  failed: "failed",
  partially_refunded: "partially_refunded",
  refunded: "refunded",
  disputed: "disputed",
}

@id("AgreementAcceptanceStatus")
enum AgreementAcceptanceStatus {
  in_progress: "in_progress",
  accepted: "accepted",
  declined: "declined",
  expired: "expired",
  superseded: "superseded",
}

@id("SyncStore")
enum SyncStore {
  local_storage: "local_storage",
  indexed_db: "indexed_db",
  supabase: "supabase",
  neon_postgres: "neon_postgres",
}

@id("SyncStatus")
enum SyncStatus {
  queued: "queued",
  persisted: "persisted",
  failed: "failed",
  superseded: "superseded",
}

@id("AssignmentStatus")
enum AssignmentStatus {
  queued: "queued",
  running: "running",
  solved: "solved",
  infeasible: "infeasible",
  canceled: "canceled",
  failed: "failed",
}

@id("ChatGroupKind")
enum ChatGroupKind {
  house: "house",
  resident_group: "resident_group",
  project_group: "project_group",
  breakout_group: "breakout_group",
  manager_group: "manager_group",
}

@id("AccessGrantStatus")
enum AccessGrantStatus {
  pending: "pending",
  active: "active",
  suspended: "suspended",
  expired: "expired",
  revoked: "revoked",
}

@id("GuestVisit")
model GuestVisit {
  @format("uuid")
  visitId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @minLength(8)
  @maxLength(255)
  hostSubject: string;

  @minLength(1)
  @maxLength(160)
  guestDisplayName: string;

  scheduledStart: utcDateTime;
  scheduledEnd: utcDateTime;
  checkedInAt?: utcDateTime;
  checkedOutAt?: utcDateTime;
  status: GuestVisitStatus;

  @format("uuid")
  accessGrantId?: string;

  @minValue(0)
  revision: int64;
}

@id("ResourceReservation")
model ResourceReservation {
  @format("uuid")
  reservationId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @format("uuid")
  resourceId: string;

  resourceKind: ResourceKind;

  @minLength(8)
  @maxLength(255)
  requestedBySubject: string;

  startsAt: utcDateTime;
  endsAt: utcDateTime;
  status: ReservationStatus;

  @minValue(1)
  @maxValue(100)
  partySize: int32;

  @maxLength(500)
  purpose?: string;

  @format("uuid")
  assignmentPlanId?: string;

  @minValue(0)
  revision: int64;
}

@id("MealPlan")
model MealPlan {
  @format("uuid")
  mealPlanId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @minLength(1)
  @maxLength(160)
  mealName: string;

  scheduledAt: utcDateTime;

  @minLength(8)
  @maxLength(255)
  coordinatorSubject: string;

  @format("uuid")
  cookingReservationId: string;

  @minValue(1)
  @maxValue(250)
  participantLimit: int32;

  @doc("Aggregate dietary summary only; never include a resident-level medical record.")
  @maxLength(1000)
  dietarySummary?: string;

  status: MealPlanStatus;

  @minValue(0)
  revision: int64;
}

@id("PollOption")
model PollOption {
  @format("uuid")
  optionId: string;

  @minLength(1)
  @maxLength(240)
  label: string;

  @minValue(0)
  sortOrder: int32;
}

@id("CommunityPoll")
model CommunityPoll {
  @format("uuid")
  pollId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @minLength(8)
  @maxLength(255)
  createdBySubject: string;

  @minLength(1)
  @maxLength(240)
  title: string;

  @maxLength(4000)
  description?: string;

  status: PollStatus;
  visibility: VoteVisibility;
  opensAt: utcDateTime;
  closesAt: utcDateTime;

  @minValue(1)
  quorum: int32;

  @minValue(1)
  maxSelections: int32;

  @minItems(2)
  options: PollOption[];

  @format("uuid")
  resultSnapshotId?: string;

  @minValue(0)
  revision: int64;
}

@id("PollVote")
model PollVote {
  @format("uuid")
  voteId: string;

  @format("uuid")
  pollId: string;

  @doc("Present only for named ballots. Anonymous ballots use the eligibility receipt.")
  @minLength(8)
  @maxLength(255)
  voterSubject?: string;

  @format("uuid")
  eligibilityReceiptId: string;

  @minItems(1)
  optionIds: string[];

  castAt: utcDateTime;

  @format("uuid")
  supersedesVoteId?: string;
}

@id("RentInvoice")
model RentInvoice {
  @format("uuid")
  invoiceId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @minLength(8)
  @maxLength(255)
  residentSubject: string;

  billingPeriodStart: plainDate;
  billingPeriodEnd: plainDate;

  @pattern("^[A-Z]{3}$")
  currency: string;

  @minValue(0)
  amountDueMinor: int64;

  @minValue(0)
  amountPaidMinor: int64;

  @minValue(0)
  amountRefundedMinor: int64;

  status: InvoiceStatus;
  dueAt: utcDateTime;

  @maxLength(255)
  stripeCustomerReference?: string;

  @maxLength(255)
  stripeInvoiceReference?: string;

  @minValue(0)
  revision: int64;
}

@id("PaymentRecord")
model PaymentRecord {
  @format("uuid")
  paymentId: string;

  @format("uuid")
  invoiceId: string;

  @minLength(16)
  @maxLength(128)
  idempotencyKey: string;

  @minValue(1)
  amountMinor: int64;

  @minValue(0)
  refundedAmountMinor: int64;

  @pattern("^[A-Z]{3}$")
  currency: string;

  status: PaymentStatus;

  @maxLength(255)
  stripePaymentReference?: string;

  @maxLength(255)
  stripeRefundReference?: string;

  @maxLength(255)
  lastWebhookEventReference?: string;

  occurredAt: utcDateTime;

  @minValue(0)
  revision: int64;
}

@id("AgreementAcceptance")
model AgreementAcceptance {
  @format("uuid")
  acceptanceId: string;

  @format("uuid")
  tenantId: string;

  @minLength(8)
  @maxLength(255)
  subject: string;

  @minLength(1)
  @maxLength(120)
  agreementType: string;

  @minLength(1)
  @maxLength(64)
  agreementVersion: string;

  @pattern("^[a-f0-9]{64}$")
  documentSha256: string;

  @pattern("^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
  locale: string;

  status: AgreementAcceptanceStatus;
  startedAt: utcDateTime;
  acceptedAt?: utcDateTime;

  @format("uuid")
  serverReceiptId?: string;

  @format("uuid")
  supersedesAcceptanceId?: string;

  @minValue(0)
  revision: int64;
}

@id("OnboardingCheckpoint")
model OnboardingCheckpoint {
  @format("uuid")
  checkpointId: string;

  @format("uuid")
  tenantId: string;

  @minLength(8)
  @maxLength(255)
  subject: string;

  @minLength(1)
  @maxLength(64)
  flowVersion: string;

  @minLength(1)
  @maxLength(120)
  stepKey: string;

  @minValue(0)
  @maxValue(100)
  completionPercent: int32;

  @format("uuid")
  currentAcceptanceId?: string;

  updatedAt: utcDateTime;

  @minValue(0)
  revision: int64;
}

@id("PersistenceReceipt")
model PersistenceReceipt {
  @format("uuid")
  receiptId: string;

  @format("uuid")
  checkpointId: string;

  store: SyncStore;
  status: SyncStatus;
  storedAt: utcDateTime;

  @minValue(0)
  sourceRevision: int64;

  @doc("True only for a server-issued canonical record; browser stores are always false.")
  canonical: boolean;

  @maxLength(120)
  errorCode?: string;
}

@id("AssignmentRequest")
model AssignmentRequest {
  @format("uuid")
  requestId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  @minLength(1)
  @maxLength(64)
  problemKind: string;

  @minItems(1)
  candidateIds: string[];

  @minItems(1)
  resourceIds: string[];

  @minLength(1)
  @maxLength(64)
  constraintSetVersion: string;

  @minLength(1)
  @maxLength(255)
  solverServiceReference: string;

  @minLength(8)
  @maxLength(255)
  requestedBySubject: string;

  queuedAt: utcDateTime;
}

@id("AssignmentDecision")
model AssignmentDecision {
  @minLength(1)
  @maxLength(255)
  candidateId: string;

  @minLength(1)
  @maxLength(255)
  resourceId: string;

  startsAt?: utcDateTime;
  endsAt?: utcDateTime;

  @minItems(1)
  reasonCodes: string[];
}

@id("AssignmentResult")
model AssignmentResult {
  @format("uuid")
  requestId: string;

  status: AssignmentStatus;

  @minLength(1)
  @maxLength(64)
  solutionVersion: string;

  assignments: AssignmentDecision[];

  @minValue(0)
  objectiveScoreScaled?: int64;

  completedAt?: utcDateTime;

  @maxLength(120)
  diagnosticCode?: string;
}

@id("ChatGroupReference")
model ChatGroupReference {
  @format("uuid")
  chatGroupId: string;

  @format("uuid")
  tenantId: string;

  @format("uuid")
  propertyId: string;

  kind: ChatGroupKind;

  @minLength(1)
  @maxLength(160)
  displayName: string;

  @minLength(1)
  @maxLength(255)
  oresChatSpaceReference: string;

  @format("uuid")
  parentChatGroupId?: string;

  @minLength(1)
  @maxLength(64)
  membershipPolicyVersion: string;

  @minValue(0)
  revision: int64;
}

@id("DeveloperAccessGrant")
model DeveloperAccessGrant {
  @format("uuid")
  grantId: string;

  @format("uuid")
  tenantId: string;

  @minLength(8)
  @maxLength(255)
  subject: string;

  role: ActorRole;

  @minItems(1)
  scopes: string[];

  @minItems(1)
  resourceReferences: string[];

  status: AccessGrantStatus;

  @minLength(8)
  @maxLength(255)
  approvedBySubject: string;

  approvedAt: utcDateTime;
  expiresAt: utcDateTime;
  revokedAt?: utcDateTime;

  @minLength(1)
  @maxLength(120)
  reasonCode: string;

  @minValue(0)
  revision: int64;
}

@id("ResidentOperationsEvent")
model ResidentOperationsEvent {
  @format("uuid")
  eventId: string;

  @format("uuid")
  tenantId: string;

  @minLength(1)
  @maxLength(64)
  aggregateType: string;

  @minLength(1)
  @maxLength(255)
  aggregateId: string;

  @minLength(1)
  @maxLength(120)
  eventType: string;

  @minLength(1)
  @maxLength(64)
  schemaVersion: string;

  occurredAt: utcDateTime;

  @maxLength(64)
  traceId?: string;
}
