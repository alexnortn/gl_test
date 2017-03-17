/**
 * Copyright 2017 Alex Norton
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */


function NearestVertex(gpgpUtility_) {
  "use strict";

  /** WebGLRenderingContext */
  let gl;
  let gpgpUtility;
  let pixels;
  let positionHandle;
  let program;
  let textureCoordHandle;
  let textureConnsHandle;
  let textureVertsHandle;

  /**
   * Compile shaders and link them into a program, then retrieve references to the
   * attributes and uniforms. The standard vertex shader, which simply passes on the
   * physical and texture coordinates, is used.
   *
   * @returns {WebGLProgram} The created program object.
   * @see {https://www.khronos.org/registry/webgl/specs/1.0/#5.6|WebGLProgram}
   */
  this.createProgram = function (gl) {
    let fragmentShaderSource;
    let program;

    // Note that the preprocessor requires the newlines.
    fragmentShaderSource = "#ifdef GL_FRAGMENT_PRECISION_HIGH\n"
                         + "precision highp float;\n"
                         + "#else\n"
                         + "precision mediump float;\n"
                         + "#endif\n"
                         + ""
                         + "uniform sampler2D uConnsTexture;"
                         + "uniform sampler2D uVertsTexture;"
                         + ""
                         + "varying vec2 vTextureCoord;"
                         + ""
                         + "void main() {"
                         + "  vec4 c;"
                         + ""
                         + "  c = texture2D(uConnsTexture, vTextureCoord);" // Look up pixel contact value (rgb -> xyz)
                         + ""
                         + "  if (c.x == 0.0) {"
                         + "    return;" // If data is empty return
                         + "  }"
                         + ""
                         + "  vec4 v;"
                         + "  float md;" // Minimum Distance
                         + "  float m;"  // Matrix Size (x == y)
                         + "  float d2;"
                         + "  float index;"
                         + ""
                         + "  md = 1.0 / 0.0000000000000000000001;" // ~infinity
                         + "  m = 1024.0;"
                         + "  d2 = 0.0;"
                         + "  index = 0.0;"
                         + ""
                         + "  for(float k=0.0; k<1024.0; ++k) {"
                         + "    for(float l=0.0; l<1024.0; ++l) {"
                         + "      v = texture2D(uVertsTexture, vec2((l/m), (k/m)));" // Get vertex location
                         + "      index++;"
                         + "      if (v.x == 0.0) {"
                         + "        break;" // If data is empty break
                         + "      }"
                         + "      d2 = (c.x - v.x) * (c.x - v.x) +" // Distance squared is faster 
                         + "           (c.y - v.y) * (c.y - v.y) +"
                         + "           (c.z - v.z) * (c.z - v.z) ;" 
                         + "      if (d2 < md) {"
                         + "        md = d2;"
                         + "        gl_FragColor.r = index;"
                         + "        gl_FragColor.g = c.x;"
                         + "        gl_FragColor.b = c.y;"
                         + "      }"
                         + "    }"
                         + "  }"
                         + "}";

    program            = gpgpUtility.createProgram(null, fragmentShaderSource);
    
    positionHandle     = gpgpUtility.getAttribLocation(program,  "position"); 
    gl.enableVertexAttribArray(positionHandle);
    
    textureCoordHandle = gpgpUtility.getAttribLocation(program,  "textureCoord");
    gl.enableVertexAttribArray(textureCoordHandle);
    
    textureConnsHandle = gpgpUtility.getUniformLocation(program, "uConnsTexture");
    textureVertsHandle = gpgpUtility.getUniformLocation(program, "uVertsTexture");

    return program;
  }

  /**
   * Runs the program to do the actual work. On exit the framebuffer &amp;
   * texture are populated with the square of the input matrix, m. Use
   * gl.readPixels to retrieve texture values.
   *
   * @param connsTexture        {WebGLTexture} A texture containing the elements of conns.
   * @param vertsTexture        {WebGLTexture} A texture containing the elements of verts.
   * @param outTexture          {WebGLTexture} A texture to be incorporated into a fbo,
   *                                             the target for our operations.
   */
  this.go = function(connsTexture, vertsTexture, outTexture) {
    let outFrameBuffer;

    // Create and bind a framebuffer (for output)
    outFrameBuffer = gpgpUtility.attachFrameBuffer(outTexture);

    gl.useProgram(program);

    gpgpUtility.getStandardVertices();

    gl.vertexAttribPointer(positionHandle,     3, gl.FLOAT, gl.FALSE, 20, 0);  //
    gl.vertexAttribPointer(textureCoordHandle, 2, gl.FLOAT, gl.FALSE, 20, 12); //

    // Set up texture (conns)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, connsTexture);
    gl.uniform1i(textureConnsHandle, 0);

    // Set up texture (verts)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, vertsTexture);
    gl.uniform1i(textureVertsHandle, 1); // Check on this

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  };

  this.element = function(i, j) {
    return i*1000.0 + j;
  }

  /**
   * Read back the i, j pixel and compare it with the expected value. The expected value
   * computation matches that in the fragment shader.
   * 
   * @param i       {integer} the i index of the matrix element to be tested.
   * @param j       {integer} the j index of the matrix element to be tested.
   * @param display {HTMLTableElement} A table for test results.
   */
  this.test = function() {
    let buffer;

    // One each for RGBA component of a pixel
    buffer = new Float32Array(4);
    // Read a 1x1 block of pixels, a single pixel -> read out a pixel block at loc [i,j] of area [size, size]
    gl.readPixels(0,                // x-coord of lower left corner
                  0,                // y-coord of lower left corner
                  1,                // width of the block
                  1,                // height of the block
                  gl.RGBA,           // Format of pixel data.
                  gl.INT,         // Data type of the pixel data, must match makeTexture
                  buffer);          // Load pixel data into buffer
  
    // let bufferLength = 0;
    // for(let i=0; i<buffer.length; i+=4) {
    //   bufferLength++;
    //   if (buffer[i] === 0) {
    //     console.log('break', bufferLength);
    //     break;
    //   }
    // }

    console.log(buffer);

//     window.buffer = buffer;
//     window.dBuff = new Float32Array(bufferLength);
//            dBuff.forEach((item, index) => dBuff[index] = buffer[index * 4]);

//   window.download = function(data) {
//       const blob = new Blob([data], { type: "application/octet-stream"});
//       window.open(URL.createObjectURL(blob), "_blank");
//   }

  };
  

  /**
   * Invoke to clean up resources specific to this program. We leave the texture
   * and frame buffer intact as they are used in followon calculations.
   */
  this.done = function ()
  {
    gl.deleteProgram(program);
  };

  // Initialize
  gpgpUtility = gpgpUtility_;
  gl          = gpgpUtility.getGLContext();
  program     = this.createProgram(gl);
  
};

// Make GPGPUtility available to others
   module.exports.make = NearestVertex;