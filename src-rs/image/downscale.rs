use super::Image;

// TODO: SIMD
pub fn downscale(source: &Image, by: f32) -> Image {
    assert!(by > 1.0);
    let &Image { data: ref source, width, height } = source;
    let over_by = 1.0 / by;
    let dw = (width as f32 * over_by) as usize;
    let dh = (height as f32 * over_by) as usize;
    let mut data = vec![0.0; dh * dw];
    let over_by2 = over_by * over_by;
    let mi = dh - 1;
    let mj = dw - 1;
    for i in 1..mi {
        let si = i as f32 * by;
        let sie = si + by;
        let sif = si as usize;
        let sic = sif + 1;
        let sief = sie as usize;
        let sir = (sic as f32) - si;
        let sire = sie - (sief as f32);
        let ib = i * dw;
        for j in 1..mj {
            let sj = j as f32 * by;
            let sje = sj + by;
            let sjf = sj as usize;
            let sjc = sjf + 1;
            let sjef = sje as usize;
            let sjr = (sjc as f32) - sj;
            let sjre = sje - (sjef as f32);
            let mut sum = 0.0;
            for rsi in sic..sief {
                for rsj in sjc..sjef {
                    sum += source[rsi * width + rsj];
                }
            }
            for rsj in sjc..sjef {
                sum += source[sif * width + rsj] * sir + source[sief * width + rsj] * sire;
            }
            for rsi in sic..sief {
                sum += source[rsi * width + sjf] * sjr + source[rsi * width + sjef] * sjre;
            }
            sum += source[sif * width + sjf] * sir * sjr;
            sum += source[sif * width + sjef] * sir * sjre;
            sum += source[sief * width + sjf] * sire * sjr;
            sum += source[sief * width + sjef] * sire * sjre;
            data[ib + j] = sum * over_by2;
        }
    }
    for i in 1..mi {
        let ib = i * dw;
        let ibe = ib + mj;
        data[ib] = data[ib + 1];
        data[ibe] = data[ibe - 1];
    }
    let mibe = mi * dw;
    let mib = mibe - dw;
    for j in 0..dw {
        data[j] = data[j + dw];
        data[mibe + j] = data[mib + j];
    }
    Image { data, width: dw, height: dh }
}

// let over_by = 1.0 / by;
// let width = (source.width as f32 * over_by) as usize;
// let height = (source.height as f32 * over_by) as usize;
// let over_by2 = over_by * over_by;
// let mut data = vec![0.0; width * height];
// let right = 1;
// let below = width;
// let diag = right + below;
// let sub = (by * 2.0) as usize;
// let mw = source.width - sub;
// let mh = source.height - sub;
// for i in 0..=mh {
//     for j in 0..=mw {
//         let val = unsafe { *source.data.get_unchecked(i * source.width + j) * over_by2 };
//         let si = i as f32 * over_by;
//         let sii = si as usize;
//         let sirr = si.fract();
//         let sir = 1.0 - sirr;
//         let sj = j as f32 * over_by;
//         let sji = sj as usize;
//         let sjrr = sj.fract();
//         let sjr = 1.0 - sjrr;
//         let di = sii * width + sji;
//         unsafe {
//             *data.get_unchecked_mut(di) += val * sir * sjr;
//             *data.get_unchecked_mut(di + right) += val * sirr * sjr;
//             *data.get_unchecked_mut(di + below) += val * sir * sjrr;
//             *data.get_unchecked_mut(di + diag) += val * sirr * sjrr;
//         }
//     }
// }
// for dj in 1..height {
//     let ind = dj * width - 3;
//     let val = data[ind];
//     data[ind + 1] = val;
//     data[ind + 2] = val;
// }
// for di in 0..width {
//     let ind = (height - 3) * width + di;
//     let val = data[ind];
//     data[ind + width] = val;
//     data[ind + width * 2] = val;
// }