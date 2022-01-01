const readFile = Blob.prototype.arrayBuffer || function(this: Blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      resolve(fr.result as ArrayBuffer);
    };
    fr.onerror = () => {
      reject(fr.error);
    };
    fr.readAsArrayBuffer(this);
  })
}

export const toPDF = async (images: ImageData[]) => {
  const pdfChunks: (string | ArrayLike<number>)[] = [];
  let index = 0;
  const offsets: number[] = [];
  const write = (chunk: string | ArrayLike<number>) => {
    pdfChunks.push(chunk);
    index += chunk.length;
  }
  const token = (chunk: string | ArrayLike<number>) => {
    write(' ');
    write(chunk);
  }
  const concat = (chunks: (string | ArrayLike<number>)[]) => {
    let len = 0;
    for (const chunk of chunks) len += chunk.length;
    const buf = new Uint8Array(len);
    len = 0;
    for (const chunk of chunks) {
      if (typeof chunk == 'string') {
        for (let i = 0; i < chunk.length; ++i) buf[i + len] = chunk.charCodeAt(i);
      } else {
        buf.set(chunk, len);
      }
      len += chunk.length;
    }
    return buf;
  }
  // Convenience functions
  const comment = (content: string) => {
    write("%" + content + '\n');
  }
  const number = (value: number) => {
    // Note: this doesnt work for very small and very large numbers
    token(value.toString());
  }
  const ascii = (value: string) => {
    token('(' + value.replace(/[\n\r\t\f\b\(\)\\]/g, c => '\\00' + c.charCodeAt(0).toString(8)) + ')');
  }
  const bin = (value: string | ArrayLike<number>) => {
    let data = '<';
    if (typeof value == 'string') {
      for (let i = 0; i < value.length; ++i) {
        data += value.charCodeAt(i).toString(16);
      }
    } else {
      for (let i = 0; i < value.length; ++i) {
        data += value[i].toString(16);
      }
    }
    token(data + '>');
  };
  const name = (value: string) => {
    // Note: only supports ASCII names
    token('/' + value);
  };
  const array = (fn: () => void) => {
    token('[');
    fn();
    token(']');
  };
  type Dict = Record<string, () => void>;
  const dict = (values: Dict) => {
    token('<<');
    for (const key in values) {
      name(key);
      values[key]();
    }
    token('>>');
  };
  const stream = (desc: Dict, content: ArrayLike<number>) => {
    if (process.env.NODE_ENV != 'production') {
      if (!desc['Length']) throw new TypeError('need stream length');
    }
    dict(desc);
    token('stream\n');
    write(content);
    write('endstream');
  };
  const object = (fn: () => void) => {
    write(' ');
    write(offsets.push(index) + ' 0 obj');
    fn();
    token('endobj');
    return offsets.length;
  };
  const reference = (id: number) => {
    token(id + ' 0 R');
  }
  const nullObject = () => {
    token('null');
  };

  // v1.4 for compatibility
  comment('PDF-1.4');
    // 4 byte binary comment, as suggested by spec
  comment('\x90\x85\xfa\xe3');
  const pages = await Promise.all(images.map(async img => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    const jpegData = new Uint8Array(await readFile.call(jpeg));
    const image = object(() => {
      stream({
        Type() {
          name('XObject');
        },
        Subtype() {
          name('Image');
        },
        Width() {
          number(img.width);
        },
        Height() {
          number(img.height);
        },
        ColorSpace() {
          name('DeviceRGB');
        },
        BitsPerComponent() {
          number(8);
        },
        Filter() {
          name('DCTDecode');
        },
        Length() {
          number(jpegData.length);
        }
      }, jpegData);
    });
    // US Letter width
    const height = 792;
    const width = height * img.width / img.height;
    const contents = object(() => {
      const result = `${width} 0 0 ${height} 0 0 cm /I Do`;
      stream({
        Length() {
          number(result.length);
        }
      }, concat([
        result
      ]));
    });
    const page = object(() => {
      dict({
        Type() {
          name('Page')
        },
        Parent() {
          reference(offsets.length + 1);
        },
        Resources() {
          dict({
            XObject() {
              dict({
                I() {
                  reference(image);
                }
              });
            }
          });
        },
        Contents() {
          reference(contents);
        },
        MediaBox() {
          array(() => {
            number(0);
            number(0);
            number(width);
            number(height);
          });
        }
      });
    });
    return page;
  }));

  const pageRoot = object(() => {
    dict({
      Type() {
        name('Pages');
      },
      Kids() {
        array(() => {
          for (const page of pages) {
            reference(page);
          }
        });
      },
      Count() {
        number(pages.length);
      }
    })
  });

  const catalog = object(() => {
    dict({
      Type() {
        name('Catalog');
      },
      Pages() {
        reference(pageRoot);
      }
    });
  });

  // XREF
  write('\n');
  const xrefOffset = index;
  write('xref\n0 ' + (offsets.length + 1) + '\n0000000000 65535 f \n');
  for (const offset of offsets) {
    write(offset.toString().padStart(10, '0') + ' 00000 n \n');
  }
  write('trailer');
  dict({
    Size() {
      number(offsets.length + 1);
    },
    Root() {
      reference(catalog);
    }
  });
  write('\nstartxref\n' + xrefOffset + '\n%%EOF');
  return concat(pdfChunks);
}