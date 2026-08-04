    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Serialize};
    use std::fmt;
    use uuid::Uuid;

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
    #[serde(rename_all = "snake_case")]
    pub enum ReservationStatus {
        Requested,
Confirmed,
CheckedIn,
Completed,
Cancelled
    }

    impl Default for ReservationStatus {
        fn default() -> Self { Self::Requested }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct Reservation {
        pub id: Uuid,
        pub title: String,
        pub summary: String,
        pub member_name: String,
pub space_name: String,
pub starts_at: DateTime<Utc>,
pub ends_at: DateTime<Utc>,
        pub status: ReservationStatus,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct CreateReservation {
        pub title: String,
        #[serde(default)]
        pub summary: String,
        pub member_name: String,
pub space_name: String,
pub starts_at: DateTime<Utc>,
pub ends_at: DateTime<Utc>,
    }

    impl CreateReservation {
        pub fn validate(&self) -> Result<(), ValidationError> {
            if self.title.trim().is_empty() { return Err(ValidationError("title must not be empty".into())); }
    if self.summary.len() > 4_000 { return Err(ValidationError("summary exceeds 4000 bytes".into())); }
    if self.member_name.trim().is_empty() { return Err(ValidationError("member_name must not be empty".into())); }
    if self.space_name.trim().is_empty() { return Err(ValidationError("space_name must not be empty".into())); }
            Ok(())
        }

        pub fn into_record(self, id: Uuid, now: DateTime<Utc>) -> Result<Reservation, ValidationError> {
            self.validate()?;
            Ok(Reservation {
                id,
                title: self.title,
                summary: self.summary,
                member_name: self.member_name,
        space_name: self.space_name,
        starts_at: self.starts_at,
        ends_at: self.ends_at,
                status: ReservationStatus::default(),
                created_at: now,
                updated_at: now,
            })
        }
    }

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct ReservationEvent {
        pub event_id: Uuid,
        pub event_type: String,
        pub occurred_at: DateTime<Utc>,
        pub data: Reservation,
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct ValidationError(pub String);

    impl fmt::Display for ValidationError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.write_str(&self.0) }
    }

    impl std::error::Error for ValidationError {}

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn status_serializes_as_wire_value() {
            let value = serde_json::to_string(&ReservationStatus::default()).unwrap();
            assert_eq!(value, serde_json::to_string(&"requested").unwrap());
        }
    }
