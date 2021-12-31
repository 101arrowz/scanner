use alloc::vec::Vec;
mod grayscale;
mod downscale;

pub struct Image {
    pub data: Vec<f32>,
    pub width: usize,
    pub height: usize
}

impl Image {
    pub fn downscale(&self, by: f32) -> Image {
        downscale::downscale(self, by)
    }
}

pub struct RGBAImage {
    pub data: Vec<u8>,
    pub width: usize,
    pub height: usize
}

impl RGBAImage {
    pub fn to_grayscale(&self) -> Image {
        grayscale::grayscale(self)
    }
}