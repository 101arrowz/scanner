use super::Image;
use alloc::vec::Vec;

// NOTE: empirical tests showed repeated box blur is roughly the same performance
// I didn't do full tests so it's something to consider for the future if this becomes a bottleneck

pub fn gaussian(source: &Image) -> Image {
    let &Image {
        data: ref source,
        width,
        height,
    } = source;
    let mut data = Vec::with_capacity(source.len());
    unsafe {
        data.set_len(data.capacity());
    }
    let wm = width - 2;
    let hm = height - 2;
    let e = 1;
    let s = width;
    let sw = s - e;
    let se = s + e;
    let e2 = e + e;
    let s2 = s + s;
    let sw2 = sw + sw;
    let ssw = s + sw;
    let sww = sw - e;
    let se2 = se + se;
    let sse = s + se;
    let see = e + se;
    for i in 2..hm {
        let ib = i * width;
        for j in 2..wm {
            let bp = ib + j;
            unsafe {
                *data.get_unchecked_mut(bp) = (*source.get_unchecked(bp - se2)
                    + *source.get_unchecked(bp - sw2)
                    + *source.get_unchecked(bp + sw2)
                    + *source.get_unchecked(bp + se2))
                    * 0.01258
                    + (*source.get_unchecked(bp - sse)
                        + *source.get_unchecked(bp - ssw)
                        + *source.get_unchecked(bp - see)
                        + *source.get_unchecked(bp - sww)
                        + *source.get_unchecked(bp + sww)
                        + *source.get_unchecked(bp + see)
                        + *source.get_unchecked(bp + ssw)
                        + *source.get_unchecked(bp + sse))
                        * 0.02516
                    + (*source.get_unchecked(bp - s2)
                        + *source.get_unchecked(bp - e2)
                        + *source.get_unchecked(bp + e2)
                        + *source.get_unchecked(bp + s2))
                        * 0.03145
                    + (*source.get_unchecked(bp - se)
                        + *source.get_unchecked(bp - sw)
                        + *source.get_unchecked(bp + sw)
                        + *source.get_unchecked(bp + se))
                        * 0.0566
                    + (*source.get_unchecked(bp - s)
                        + *source.get_unchecked(bp - e)
                        + *source.get_unchecked(bp + e)
                        + *source.get_unchecked(bp + s))
                        * 0.07547
                    + *source.get_unchecked(bp) * 0.09434
            };
        }
    }
    for i in 2..hm {
        let ib = i * width;
        let ibe = ib + wm;
        unsafe {
            let val = *data.get_unchecked(ib + 2);
            *data.get_unchecked_mut(ib + 1) = val;
            *data.get_unchecked_mut(ib) = val;
            let val = *data.get_unchecked(ibe - 1);
            *data.get_unchecked_mut(ibe) = val;
            *data.get_unchecked_mut(ibe + 1) = val;
        }
    }
    let hmb = hm * width;
    let hmb2 = hmb - width;
    let hmbe = hmb + width;
    let w2 = width + width;
    for j in 0..width {
        unsafe {
            let val = *data.get_unchecked(w2 + j);
            *data.get_unchecked_mut(width + j) = val;
            *data.get_unchecked_mut(j) = val;
            let val = *data.get_unchecked(hmb2 + j);
            *data.get_unchecked_mut(hmb + j) = val;
            *data.get_unchecked_mut(hmbe + j) = val;
        }
    }
    Image {
        data,
        width,
        height,
    }
}
