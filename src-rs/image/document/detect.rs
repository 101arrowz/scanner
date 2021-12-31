use super::super::Image;
use alloc::vec::Vec;

use super::consts::{COS, SIN};

pub struct Point {
    pub x: f32,
    pub y: f32,
}

pub struct Rect {
    pub a: Point,
    pub b: Point,
    pub c: Point,
    pub d: Point,
}

pub struct ScoredRect {
    pub rect: Rect,
    pub score: f32,
}

pub struct Line {
    angle: u8,
    bin: usize,
    score: f32,
}

pub fn edges(source: &Image) -> Vec<ScoredRect> {
    let &Image {
        data: ref source,
        width,
        height,
    } = source;
    Vec::new()
}
