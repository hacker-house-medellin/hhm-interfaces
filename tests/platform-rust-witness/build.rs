use std::{env, fs, path::PathBuf};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let root = manifest.join("../..");
    let out = PathBuf::from(env::var("OUT_DIR").expect("out dir"));
    for (source, target) in [
        ("generated/platform/rust/types.rs", "types.rs"),
        ("generated/platform/seaorm/entities.rs", "entities.rs"),
        ("generated/platform/diesel/schema.rs", "schema.rs"),
    ] {
        let source_path = root.join(source);
        println!("cargo:rerun-if-changed={}", source_path.display());
        let contents = fs::read_to_string(&source_path).expect("read generated Rust lane");
        let sanitized = contents
            .lines()
            .filter(|line| !line.starts_with("#!["))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(out.join(target), format!("{sanitized}\n")).expect("write witness source");
    }
}
