use core::cmp::Ordering;
use wasm_bindgen::prelude::*;

mod consts;
mod detect;
mod perspective;

pub use detect::*;
pub use perspective::*;

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct Point {
    pub x: f32,
    pub y: f32,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct Quad {
    pub a: Point,
    pub b: Point,
    pub c: Point,
    pub d: Point,
}

#[wasm_bindgen]
impl Quad {
    #[wasm_bindgen(constructor)]
    pub fn new(ax: f32, ay: f32, bx: f32, by: f32, cx: f32, cy: f32, dx: f32, dy: f32) -> Quad {
        Quad {
            a: Point { x: ax, y: ay },
            b: Point { x: bx, y: by },
            c: Point { x: cx, y: cy },
            d: Point { x: dx, y: dy },
        }
    }
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
