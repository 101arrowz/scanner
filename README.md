# scanner

Document scanner for the web built in Rust. Zero runtime dependencies - all the hard math is done by hand. Rust source in `src-rs`; most of it is just copied verbatim from the TypeScript code [on the master branch](https://github.com/101arrowz/scanner/tree/master), but I made a few optimizations where possible. The WASM port is a bit faster on desktop and substantially faster on mobile. This branch also includes a much nicer UI Demo available [here](https://101arrowz.github.io/scanner/next/).

Check out [my ongoing blog series](https://dev.to/101arrowz/series/15877) on this project to learn more about all the techniques I employed to make this project possible!