use alloc::vec::Vec;

mod document;
mod downscale;
mod gaussian;
mod grayscale;
pub use document::{GradientVotesResult, Line, Point, Quad, ScoredQuad};

pub struct Image {
    pub data: Vec<f32>,
    pub width: usize,
    pub height: usize,
}

impl Image {
    pub fn downscale(&self, by: f32) -> Image {
        downscale::downscale(self, by)
    }
    pub fn gaussian(&self) -> Image {
        gaussian::gaussian(self)
    }
    pub fn quads(&self) -> Vec<ScoredQuad> {
        let result = document::gradient_votes(self);
        let mut edges = document::edges(&result, 0.05);
        edges.truncate(20);
        edges.sort_unstable_by(|a, b| b.cmp(a));
        document::documents(&result, &edges)
    }
}

pub struct RGBAImage {
    pub data: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

impl RGBAImage {
    pub fn to_grayscale(&self) -> Image {
        grayscale::grayscale(self)
    }
    pub fn perspective(&self, quad: Quad, width: usize, height: usize) -> RGBAImage {
        document::perspective(self, quad, width, height)
    }
}
