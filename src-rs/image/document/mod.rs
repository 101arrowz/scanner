mod consts;
mod detect;
pub use detect::*;

#[derive(Clone, Copy)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy)]
pub struct Quad {
    pub a: Point,
    pub b: Point,
    pub c: Point,
    pub d: Point,
}

#[derive(Clone, Copy)]
pub struct ScoredQuad {
    pub quad: Quad,
    pub score: f32,
}