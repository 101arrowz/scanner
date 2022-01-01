use core::cmp::Ordering;

mod consts;
mod detect;
mod perspective;

pub use detect::*;
pub use perspective::*;

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

impl PartialEq for ScoredQuad {
    fn eq(&self, other: &Self) -> bool {
        self.score.eq(&other.score)
    }
}
impl Eq for ScoredQuad {}
impl PartialOrd for ScoredQuad {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        self.score.partial_cmp(&other.score)
    }
}
impl Ord for ScoredQuad {
    fn cmp(&self, other: &Self) -> Ordering {
        self.score.partial_cmp(&other.score).unwrap()
    }
}
