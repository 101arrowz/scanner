#![no_std]
#![feature(int_abs_diff)]
#[macro_use]
extern crate alloc;

use alloc::vec::Vec;
use wasm_bindgen::prelude::*;

#[cfg(not(target_arch = "wasm32"))]
compile_error!("Only compilable to WASM");

mod image;
use image::{Image, RGBAImage};

#[wasm_bindgen]
pub fn document(data: Vec<u8>, width: usize, height: usize, by: f32) -> Vec<f32> {
    (RGBAImage {
        data,
        width,
        height,
    })
    .to_grayscale()
    .downscale(by)
    .gaussian()
    .data
}
