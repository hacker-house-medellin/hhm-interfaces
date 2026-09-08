//! Compile witness for every generated Rust projection.

#[macro_use]
extern crate diesel;

#[allow(dead_code, unused_imports)]
pub mod types {
    include!(concat!(env!("OUT_DIR"), "/types.rs"));
}

#[allow(dead_code, unused_imports)]
pub mod seaorm {
    include!(concat!(env!("OUT_DIR"), "/entities.rs"));
}

#[allow(dead_code, unused_imports)]
pub mod diesel_lane {
    include!(concat!(env!("OUT_DIR"), "/schema.rs"));
}

pub use diesel_lane::{schema, sql_types};
