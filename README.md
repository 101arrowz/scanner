# scanner

Document scanner for the web built in Rust. Zero runtime dependencies - all the hard math is done by hand. Original TypeScript code from the master branch includes all the logic is in `src/index.ts`, but it's admittedly a bit hard to read. Rust source in `src-rs`; most of it is just copied verbatim from TypeScript, but I made a few optimizations where possible. The WASM port is a bit faster on desktop and substantially faster on mobile. Demo will soon be available [here](https://101arrowz.github.io/scanner/).

Check out [my ongoing blog series](https://dev.to/101arrowz/series/15877) on this project to learn more about all the techniques I employed to make this project possible!