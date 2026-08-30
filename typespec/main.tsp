import "@typespec/http";
import "@typespec/openapi3";
import "@typespec/json-schema";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.JsonSchema;
using TypeSpec.OpenAPI;

@service(#{
  title: "HHaus intake API",
})
@info(#{
  version: "1.0.0",
  summary: "Public and authenticated residency intake for HHaus.",
  contact: #{name: "HHaus", url: "https://hhaus.org"},
  license: #{name: "Proprietary intake contract"},
})
@server("https://api.hhaus.org", "HHaus production API")
namespace HHaus.Intake;

@doc("A stable lower-case email address. The server normalizes the domain and preserves the local part.")
@format("email")
@minLength(3)
@maxLength(320)
scalar EmailAddress extends string;

@doc("An HTTPS LinkedIn profile URL. Redirectors and credential-bearing URLs are rejected.")
@format("uri")
@minLength(20)
@maxLength(500)
scalar LinkedInUrl extends string;

@doc("An opaque Shared Auth subject. It is always derived from a verified session, never accepted from a form body.")
@minLength(8)
@maxLength(255)
scalar SharedAuthSubject extends string;

@doc("A client-generated idempotency key. Reusing it with a different body is rejected.")
@minLength(16)
@maxLength(128)
scalar IdempotencyKey extends string;

@doc("A UUID formatted identifier.")
@format("uuid")
scalar Uuid extends string;

enum StayPreference {
  three_months: "three_months",
  six_months: "six_months",
}

enum ProjectStage {
  idea: "idea",
  prototype: "prototype",
  early_revenue: "early_revenue",
  growing: "growing",
  nonprofit_or_open_source: "nonprofit_or_open_source",
}

enum ApplicationStatus {
  submitted: "submitted",
  under_review: "under_review",
  needs_information: "needs_information",
  interview: "interview",
  accepted: "accepted",
  waitlisted: "waitlisted",
  declined: "declined",
  withdrawn: "withdrawn",
}

enum UploadKind {
  resume: "resume",
  photo_id: "photo_id",
}

enum UploadStatus {
  pending: "pending",
  uploaded: "uploaded",
  verified: "verified",
  quarantined: "quarantined",
  expired: "expired",
  deleted: "deleted",
}

enum ReferralStatus {
  submitted: "submitted",
  invited: "invited",
  applied: "applied",
  accepted: "accepted",
  declined: "declined",
}

enum MirrorStatus {
  pending: "pending",
  mirrored: "mirrored",
  retryable_failure: "retryable_failure",
  terminal_failure: "terminal_failure",
}

@jsonSchema
model PreInterestCreate {
  email: EmailAddress;
  linkedinUrl: LinkedInUrl;

  @minLength(40)
  @maxLength(4000)
  entrepreneurshipIdea: string;

  stayPreference: StayPreference;

  @doc("The versioned privacy notice the applicant affirmatively accepted.")
  @minLength(1)
  @maxLength(64)
  privacyNoticeVersion: string;

  @doc("An anti-automation proof. It is validated server-side and is never persisted.")
  @minLength(1)
  @maxLength(4096)
  turnstileToken: string;
}

@jsonSchema
model UploadIntentCreate {
  kind: UploadKind;

  @minLength(1)
  @maxLength(255)
  fileName: string;

  @minLength(3)
  @maxLength(128)
  contentType: string;

  @minValue(1)
  @maxValue(10485760)
  sizeBytes: int64;

  @doc("Lower-case hexadecimal SHA-256 digest of the exact upload bytes.")
  @pattern("^[a-f0-9]{64}$")
  sha256: string;

  @minLength(1)
  @maxLength(4096)
  turnstileToken: string;
}

@jsonSchema
model UploadIntentReceipt {
  uploadId: Uuid;
  kind: UploadKind;
  uploadUrl: url;
  expiresAt: utcDateTime;
  maximumBytes: int64;
  allowedContentTypes: string[];
}

@jsonSchema
model UploadCompleteCreate {
  @doc("Lower-case hexadecimal SHA-256 digest of the exact bytes uploaded to Supabase Storage.")
  @pattern("^[a-f0-9]{64}$")
  sha256: string;

  @minLength(1)
  @maxLength(4096)
  turnstileToken: string;
}

@jsonSchema
model UploadCompletionReceipt {
  uploadId: Uuid;
  status: "verified";
}

@jsonSchema
model ApplicationCreate {
  email: EmailAddress;
  linkedinUrl: LinkedInUrl;

  @minLength(2)
  @maxLength(200)
  legalName: string;

  @doc("Used only for age eligibility review and subject to the intake retention policy.")
  dateOfBirth: plainDate;

  @minLength(2)
  @maxLength(120)
  nationality: string;

  @minLength(7)
  @maxLength(32)
  phone: string;

  @minLength(2)
  @maxLength(160)
  currentCity: string;

  githubUrl?: url;
  portfolioUrl?: url;

  @minLength(80)
  @maxLength(8000)
  entrepreneurshipIdea: string;

  projectStage: ProjectStage;
  stayPreference: StayPreference;
  preferredStartMonth: plainDate;

  @minLength(40)
  @maxLength(4000)
  communityContribution: string;

  @maxLength(4000)
  accessibilityOrAccommodationNotes?: string;

  resumeUploadId: Uuid;
  photoIdUploadId: Uuid;

  @doc("The applicant attests that they are at least 18 and the submitted identity document is theirs.")
  ageAndIdentityAttestation: true;

  @minLength(1)
  @maxLength(64)
  privacyNoticeVersion: string;

  @minLength(1)
  @maxLength(4096)
  turnstileToken: string;
}

@jsonSchema
model ReferralCreate {
  @minLength(2)
  @maxLength(200)
  refereeName: string;

  refereeEmail: EmailAddress;
  refereeLinkedinUrl: LinkedInUrl;

  @minLength(2)
  @maxLength(120)
  relationship: string;

  @minLength(40)
  @maxLength(4000)
  rationale: string;

  stayPreference?: StayPreference;

  @doc("The referrer confirms the nominee has agreed to be referred and contacted.")
  nomineeConsentConfirmed: true;
}

@jsonSchema
model SubmissionReceipt {
  submissionId: Uuid;
  kind: "pre_interest" | "application" | "referral";
  acceptedAt: utcDateTime;
  primaryPersistence: "stored";
  supabasePersistence: "stored";
}

@jsonSchema
model UserPointsAccount {
  subject: SharedAuthSubject;
  balance: int64;
  lifetimeEarned: int64;
  lifetimeRedeemed: int64;
  version: int64;
  updatedAt: utcDateTime;
}

@jsonSchema
model UserPointsLedgerEntry {
  entryId: Uuid;
  subject: SharedAuthSubject;
  delta: int64;

  @minLength(2)
  @maxLength(64)
  reasonCode: string;

  sourceSubmissionId?: Uuid;
  occurredAt: utcDateTime;
}

@jsonSchema
model ApiError {
  @minLength(2)
  @maxLength(64)
  code: string;

  @minLength(2)
  @maxLength(500)
  message: string;

  retryable: boolean;
  submissionId?: Uuid;
}

model CreatedSubmissionResponse {
  @statusCode statusCode: 201;
  @body body: SubmissionReceipt;
}

model CreatedUploadResponse {
  @statusCode statusCode: 201;
  @body body: UploadIntentReceipt;
}

model CompletedUploadResponse {
  @statusCode statusCode: 200;
  @body body: UploadCompletionReceipt;
}

model InvalidResponse {
  @statusCode statusCode: 422;
  @body body: ApiError;
}

model UnauthorizedResponse {
  @statusCode statusCode: 401;
  @body body: ApiError;
}

model ConflictResponse {
  @statusCode statusCode: 409;
  @body body: ApiError;
}

model UnavailableResponse {
  @statusCode statusCode: 503;
  @body body: ApiError;
}

@route("/v1/pre-interests")
interface PreInterests {
  @post
  create(
    @header("Idempotency-Key") idempotencyKey: IdempotencyKey,
    @body body: PreInterestCreate,
  ): CreatedSubmissionResponse | InvalidResponse | ConflictResponse | UnavailableResponse;
}

@route("/v1/intake/uploads")
interface IntakeUploads {
  @post
  create(
    @header("Idempotency-Key") idempotencyKey: IdempotencyKey,
    @body body: UploadIntentCreate,
  ): CreatedUploadResponse | InvalidResponse | ConflictResponse | UnavailableResponse;

  @route("/{uploadId}/complete")
  @post
  complete(
    @path uploadId: Uuid,
    @body body: UploadCompleteCreate,
  ): CompletedUploadResponse | InvalidResponse | ConflictResponse | UnavailableResponse;
}

@route("/v1/applications")
interface Applications {
  @post
  create(
    @header("Idempotency-Key") idempotencyKey: IdempotencyKey,
    @body body: ApplicationCreate,
  ): CreatedSubmissionResponse | InvalidResponse | ConflictResponse | UnavailableResponse;
}

@route("/v1/referrals")
@useAuth(BearerAuth)
interface Referrals {
  @doc("Requires a verified Shared Auth user bearer token. The referrer subject is derived from that token.")
  @post
  create(
    @header("Idempotency-Key") idempotencyKey: IdempotencyKey,
    @body body: ReferralCreate,
  ): CreatedSubmissionResponse | UnauthorizedResponse | InvalidResponse | ConflictResponse | UnavailableResponse;
}
