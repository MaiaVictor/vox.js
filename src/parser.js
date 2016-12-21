(function() {
    
    /** 
     * @constructor
     */
    vox.Parser = function() {};
    
    /**
     * 戻り値のPromiseは成功すると{@link vox.VoxelData}を返す.
     * @param {String} url
     * @return {Promise}
     */
    vox.Parser.prototype.parse = function(url) {
        var self = this;
        var xhr = new vox.Xhr();
        return xhr.getBinary(url).then(function(uint8Array) {
            return new Promise(function(resolve, reject) {
                self.parseUint8Array(uint8Array, function(error, voxelData) {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(voxelData);
                    }
                });
            });
        });
    };

    if (typeof(require) !== "undefined") {
        var fs = require("fs");
        /**
         * for node.js
         * @param {String} path
         * @param {function} callback
         */
        vox.Parser.prototype.parseFile = function(path, callback) {
            fs.readFile(path, function(error, data) {
                if (error) {
                    return callback(error);
                } else {
                    var uint8Array = new Uint8Array(new ArrayBuffer(data.length));
                    for (var i = 0, len = data.length; i < len; i++) {
                        uint8Array[i] = data[i];
                    }
                    this.parseUint8Array(uint8Array, callback);
                }
            }.bind(this));
        };
    }
    
    /**
     * @param {Uint8Array} uint8Array
     * @param {function} callback
     */
    vox.Parser.prototype.parseUint8Array = function(uint8Array, callback) {
        var dataHolder = new DataHolder(uint8Array);
        try {
            root(dataHolder);
            dataHolder.data.size = dataHolder.data.anim[0].size;
            dataHolder.data.voxels = dataHolder.data.anim[0].voxels;
            if (dataHolder.data.palette.length === 0) {
                // console.debug("(use default palette)");
                dataHolder.data.palette = vox.defaultPalette;
            } else {
                dataHolder.data.palette.unshift(dataHolder.data.palette[0]);
                dataHolder.data.palette.pop();
            }

            callback(null, dataHolder.data);
        } catch (e) {
            callback(e);
        }
    };
    
    var DataHolder = function(uint8Array) {
        this.uint8Array = uint8Array;
        this.cursor = 0;
        this.data = new vox.VoxelData();
        
        this._currentChunkId = null;
        this._currentChunkSize = 0;
    };
    DataHolder.prototype.next = function() {
        if (this.uint8Array.byteLength <= this.cursor) {
            throw new Error("uint8Array index out of bounds: " + this.uint8Array.byteLength);
        }
        return this.uint8Array[this.cursor++];
    };
    DataHolder.prototype.hasNext = function() {
        return this.cursor < this.uint8Array.byteLength;
    };
    
    var root = function(dataHolder) {
        magicNumber(dataHolder);
        versionNumber(dataHolder);
        chunk(dataHolder); // main chunk
    };
    
    var magicNumber = function(dataHolder) {
        var str = "";
        for (var i = 0; i < 4; i++) {
            str += String.fromCharCode(dataHolder.next());
        }
        
        if (str !== "VOX ") {
            throw new Error("invalid magic number '" + str + "'");
        }
    };
    
    var versionNumber = function(dataHolder) {
        var ver = 0;
        for (var i = 0; i < 4; i++) {
            ver += dataHolder.next() * Math.pow(256, i);
        }
        console.info(".vox format version " + ver);
    };
    
    var chunk = function(dataHolder) {
        if (!dataHolder.hasNext()) return false;

        chunkId(dataHolder);
        sizeOfChunkContents(dataHolder);
        totalSizeOfChildrenChunks(dataHolder);
        contents(dataHolder);
        while (chunk(dataHolder));
        return dataHolder.hasNext();
    };
    
    var chunkId = function(dataHolder) {
        var id = "";
        for (var i = 0; i < 4; i++) {
            id += String.fromCharCode(dataHolder.next());
        }
        dataHolder._currentChunkId = id;
        dataHolder._currentChunkSize = 0;
        
        // console.debug("chunk id = " + id);
    };
    
    var sizeOfChunkContents = function(dataHolder) {
        var size = 0;
        for (var i = 0; i < 4; i++) {
            size += dataHolder.next() * Math.pow(256, i);
        }
        dataHolder._currentChunkSize = size;
        
        // console.debug("  size of chunk = " + size);
    };
    
    var totalSizeOfChildrenChunks = function(dataHolder) {
        var size = 0;
        for (var i = 0; i < 4; i++) {
            size += dataHolder.next() * Math.pow(256, i);
        }
        
        // console.debug("  total size of children chunks = " + size);
    };
    
    var contents = function(dataHolder) {
        switch (dataHolder._currentChunkId) {
        case "PACK":
            contentsOfPackChunk(dataHolder);
            break;
        case "SIZE":
            contentsOfSizeChunk(dataHolder);
            break;
        case "XYZI":
            contentsOfVoxelChunk(dataHolder);
            break;
        case "RGBA":
            contentsOfPaletteChunk(dataHolder);
            break;
        case "MATT":
            contentsOfMaterialChunk(dataHolder);
            break;
        }
    };
    
    var contentsOfPackChunk = function(dataHolder) {
        var size = 0;
        for (var i = 0; i < 4; i++) {
            size += dataHolder.next() * Math.pow(256, i);
        }
        
        // console.debug("  num of SIZE and XYZI chunks = " + size);
    };
    
    var contentsOfSizeChunk = function(dataHolder) {
        var x = 0;
        for (var i = 0; i < 4; i++) {
            x += dataHolder.next() * Math.pow(256, i);
        }
        var y = 0;
        for (var i = 0; i < 4; i++) {
            y += dataHolder.next() * Math.pow(256, i);
        }
        var z = 0;
        for (var i = 0; i < 4; i++) {
            z += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("  bounding box size = " + x + ", " + y + ", " + z);

        var data = dataHolder.data.anim[dataHolder.data.anim.length - 1];
        if (data.size) {
            data = { size: null, voxels: [] };
            dataHolder.data.anim.push(data);
        }
        data.size = {
            x: x,
            y: y,
            z: z,
        };
    };
    
    var contentsOfVoxelChunk = function(dataHolder) {
        var num = 0;
        for (var i = 0; i < 4; i++) {
            num += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("  voxel size = " + num);

        var data = dataHolder.data.anim[dataHolder.data.anim.length - 1];
        if (data.voxels.length) {
            data = { size: null, voxels: [] };
            dataHolder.data.anim.push(data);
        }
        for (var i = 0; i < num; i++) {
            data.voxels.push({
                x: dataHolder.next(),
                y: dataHolder.next(),
                z: dataHolder.next(),
                colorIndex: dataHolder.next(),
            });
        }
    };

    var contentsOfPaletteChunk = function(dataHolder) {
        // console.debug("  palette");
        for (var i = 0; i < 256; i++) {
            var p = {
                r: dataHolder.next(),
                g: dataHolder.next(),
                b: dataHolder.next(),
                a: dataHolder.next(),
            };
            dataHolder.data.palette.push(p);
        }
    };
    
    var contentsOfMaterialChunk = function(dataHolder) {
        // console.debug("  material");
        var id = 0;
        for (var i = 0; i < 4; i++) {
            id += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("    id = " + id);

        var type = 0;
        for (var i = 0; i < 4; i++) {
            type += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("    type = " + type + " (0:diffuse 1:metal 2:glass 3:emissive)");

        var weight = 0;
        for (var i = 0; i < 4; i++) {
            weight += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("    weight = " + parseFloat(weight));

        var propertyBits = 0;
        for (var i = 0; i < 4; i++) {
            propertyBits += dataHolder.next() * Math.pow(256, i);
        }
        // console.debug("    property bits = " + propertyBits.toString(2));
        var plastic = !!(propertyBits & 1);
        var roughness = !!(propertyBits & 2);
        var specular = !!(propertyBits & 4);
        var ior = !!(propertyBits & 8);
        var attenuation = !!(propertyBits & 16);
        var power = !!(propertyBits & 32);
        var glow = !!(propertyBits & 64);
        var isTotalPower = !!(propertyBits & 128);
        // console.debug("      Plastic = " + plastic);
        // console.debug("      Roughness = " + roughness);
        // console.debug("      Specular = " + specular);
        // console.debug("      IOR = " + ior);
        // console.debug("      Attenuation = " + attenuation);
        // console.debug("      Power = " + power);
        // console.debug("      Glow = " + glow);
        // console.debug("      isTotalPower = " + isTotalPower);

        var valueNum = 0;
        if (plastic) valueNum += 1;
        if (roughness) valueNum += 1;
        if (specular) valueNum += 1;
        if (ior) valueNum += 1;
        if (attenuation) valueNum += 1;
        if (power) valueNum += 1;
        if (glow) valueNum += 1;
        // isTotalPower is no value
        
        var values = [];
        for (var j = 0; j < valueNum; j++) {
            values[j] = 0;
            for (var i = 0; i < 4; i++) {
                values[j] += dataHolder.next() * Math.pow(256, i);
            }
            // console.debug("    normalized property value = " + parseFloat(values[j]));
        }
    };
    
    var parseFloat = function(bytes) {
        var bin = bytes.toString(2);
        while(bin.length < 32) {
            bin = "0" + bin;
        }
        var sign = bin[0] == "0" ? 1 : -1;
        var exponent = Number.parseInt(bin.substring(1, 9), 2) - 127;
        var fraction = Number.parseFloat("1." + Number.parseInt(bin.substring(9), 2));
        return sign * Math.pow(2, exponent) * fraction;
    };

})();
