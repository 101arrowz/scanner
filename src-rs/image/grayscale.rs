use super::{Image, RGBAImage};

// grayscale and fit range to 0-1
// TODO: SIMD

pub fn grayscale(source: &RGBAImage) -> Image {
    let &RGBAImage {
        data: ref source,
        width,
        height,
    } = source;
    Image {
        data: source
            .chunks_exact(4)
            .map(|rgba| unsafe {
                (*rgba.get_unchecked(0) as f32) * 0.00116796875
                    + (*rgba.get_unchecked(1) as f32) * 0.00229296875
                    + (*rgba.get_unchecked(2) as f32) * 0.0004453125
            })
            .collect(),
        width,
        height,
    }
}
