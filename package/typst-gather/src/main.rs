use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;
use typst_gather::{gather_packages, Config};

#[derive(Parser)]
#[command(version, about = "Gather Typst packages to a local directory")]
struct Args {
    /// TOML file specifying packages to gather
    spec_file: PathBuf,
}

fn main() -> ExitCode {
    let args = Args::parse();

    let content = match std::fs::read_to_string(&args.spec_file) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error reading spec file: {e}");
            return ExitCode::FAILURE;
        }
    };

    let config = match Config::parse(&content) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Error parsing spec file: {e}");
            return ExitCode::FAILURE;
        }
    };

    let dest = match &config.destination {
        Some(d) => d.clone(),
        None => {
            eprintln!("Error: 'destination' field is required in spec file");
            return ExitCode::FAILURE;
        }
    };

    let discover = config.discover.clone();
    let entries = config.into_entries();
    let stats = gather_packages(&dest, entries, &discover);

    println!(
        "\nDone: {} downloaded, {} copied, {} skipped, {} failed",
        stats.downloaded, stats.copied, stats.skipped, stats.failed
    );

    if stats.failed > 0 {
        ExitCode::FAILURE
    } else {
        ExitCode::SUCCESS
    }
}
