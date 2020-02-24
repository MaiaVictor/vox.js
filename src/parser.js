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
                debugLog("(use default palette)");
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

        this._arrayArray = [];
        this._cursorArray = [];
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
    DataHolder.prototype.push = function(chunkSize) {
        var array = new Uint8Array(chunkSize);
        for (var i = 0; i < array.length; i++) {
            array[i] = this.next();
        }

        this._arrayArray.push(this.uint8Array);
        this._cursorArray.push(this.cursor);

        this.uint8Array = array;
        this.cursor = 0;
    };
    DataHolder.prototype.pop = function() {
        this.uint8Array = this._arrayArray.pop();
        this.cursor = this._cursorArray.pop();
    };
    DataHolder.prototype.parseInt32 = function() {
        var intValue = 0;
        for (var i = 0; i < 4; i++) {
            intValue += this.next() * Math.pow(256, i);
        }
        // unsigned to signed
        return ~~intValue;
    };
    DataHolder.prototype.parseString = function() {
        var n = this.parseInt32();
        var str = "";
        for (var i = 0; i < n; i++) {
            str += String.fromCharCode(this.next());
        }
        return str;
    };
    DataHolder.prototype.parseDict = function() {
        var n = this.parseInt32();
        // debugLog("    dict num of pair = " + n);
        var dict = {};
        for (var i = 0; i < n; i++) {
            var key = this.parseString();
            var value = this.parseString();
            dict[key] = value;
        }
        return dict;
    };
    DataHolder.prototype.parseRotation = function() {
        var bytes = this.next();
    };

    var root = function(dataHolder) {
        parseMagicNumber(dataHolder);
        parseVersionNumber(dataHolder);
        parseChunk(dataHolder); // main chunk
    };
    
    var parseMagicNumber = function(dataHolder) {
        var str = "";
        for (var i = 0; i < 4; i++) {
            str += String.fromCharCode(dataHolder.next());
        }
        
        if (str !== "VOX ") {
            throw new Error("invalid magic number '" + str + "'");
        }
    };
    
    var parseVersionNumber = function(dataHolder) {
        var ver = dataHolder.parseInt32();
    };
    
    var parseChunk = function(dataHolder) {
        if (!dataHolder.hasNext()) return false;

        var chunkId = parseChunkId(dataHolder);
        var chunkSize = parseSizeOfChunkContents(dataHolder);
        parseTotalSizeOfChildrenChunks(dataHolder);
        parseContents(chunkId, chunkSize, dataHolder);
        while (parseChunk(dataHolder));
        return dataHolder.hasNext();
    };
    
    var parseChunkId = function(dataHolder) {
        var id = "";
        for (var i = 0; i < 4; i++) {
            id += String.fromCharCode(dataHolder.next());
        }
        debugLog("chunk id = " + id);
        return id;
    };
    
    var parseSizeOfChunkContents = function(dataHolder) {
        var size = dataHolder.parseInt32();
        // debugLog("  size of chunk = " + size);
        return size;
    };
    
    var parseTotalSizeOfChildrenChunks = function(dataHolder) {
        var size = dataHolder.parseInt32();
    };

    var parseContents = function(chunkId, chunkSize, dataHolder) {
        dataHolder.push(chunkSize);

        switch (chunkId) {
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
        case "nTRN":
            contentsOfTransformNodeChunk(dataHolder);
            break;
        case "nGRP":
            contentsOfGroupNodeChunk(dataHolder);
            break;
        case "nSHP":
            contentsOfShapeNodeChunk(dataHolder);
            break;
        case "MATL":
            contentsOfMaterialExChunk(dataHolder);
            break;
        default:
            unsupportedChunkType(dataHolder);
            break;
        }

        dataHolder.pop();
    };
    
    var contentsOfPackChunk = function(dataHolder) {
        var size = dataHolder.parseInt32();
        debugLog("  num of SIZE and XYZI chunks = " + size);
    };
    
    var contentsOfSizeChunk = function(dataHolder) {
        var x = dataHolder.parseInt32();
        var y = dataHolder.parseInt32();
        var z = dataHolder.parseInt32();
        debugLog("  bounding box size = " + x + ", " + y + ", " + z);

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
        var num = dataHolder.parseInt32();
        debugLog("  voxel size = " + num);

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
        debugLog("  palette");
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
        debugLog("  material");
        var id = dataHolder.parseInt32();
        debugLog("    id = " + id);

        var type = dataHolder.parseInt32();
        debugLog("    type = " + type + " (0:diffuse 1:metal 2:glass 3:emissive)");

        var weight = dataHolder.parseInt32();
        debugLog("    weight = " + logFloat(weight));

        var propertyBits = dataHolder.parseInt32();
        debugLog("    property bits = " + propertyBits.toString(2));
        var plastic = !!(propertyBits & 1);
        var roughness = !!(propertyBits & 2);
        var specular = !!(propertyBits & 4);
        var ior = !!(propertyBits & 8);
        var attenuation = !!(propertyBits & 16);
        var power = !!(propertyBits & 32);
        var glow = !!(propertyBits & 64);
        var isTotalPower = !!(propertyBits & 128);
        debugLog("      Plastic = " + plastic);
        debugLog("      Roughness = " + roughness);
        debugLog("      Specular = " + specular);
        debugLog("      IOR = " + ior);
        debugLog("      Attenuation = " + attenuation);
        debugLog("      Power = " + power);
        debugLog("      Glow = " + glow);
        debugLog("      isTotalPower = " + isTotalPower);

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
            values[j] = dataHolder.parseInt32();
            debugLog("    normalized property value = " + logFloat(values[j]));
        }
    };

    var contentsOfTransformNodeChunk = function(dataHolder) {
        var nodeId = dataHolder.parseInt32();
        var nodeAttributes = dataHolder.parseDict();
        var childNodeId = dataHolder.parseInt32();
        var reservedId = dataHolder.parseInt32();
        var layerId = dataHolder.parseInt32();
        var numOfFrames = dataHolder.parseInt32();
        var frameAttributes = [];
        for (var i = 0; i < numOfFrames; i++) {
            frameAttributes[i] = dataHolder.parseDict();
        }

        debugLog("  nodeId = " + nodeId);
        debugLog("  nodeAttributes", nodeAttributes);
        debugLog("  childNodeId = " + childNodeId);
        debugLog("  reservedId = " + reservedId);
        debugLog("  layerId = " + layerId);
        debugLog("  numOfFrames = " + numOfFrames);
        debugLog("  frameAttributes", frameAttributes);
    };

    var contentsOfGroupNodeChunk = function(dataHolder) {
        var nodeId = dataHolder.parseInt32();
        var nodeAttributes = dataHolder.parseDict();
        var numOfChildren = dataHolder.parseInt32();
        var childNodeIds = [];
        for (var i = 0; i < numOfChildren; i++) {
            childNodeIds[i] = dataHolder.parseInt32();
        }
        
        debugLog("  nodeId = " + nodeId);
        debugLog("  nodeAttributes", nodeAttributes);
        debugLog("  numOfChildren = " + numOfChildren);
        debugLog("  childNodeIds", childNodeIds);
    };

    var contentsOfShapeNodeChunk = function(dataHolder) {
        var nodeId = dataHolder.parseInt32();
        var nodeAttributes = dataHolder.parseDict();
        var numOfModels = dataHolder.parseInt32();
        var modelIds = [];
        var modelAttributes = [];
        for (var i = 0; i < numOfModels; i++) {
            modelIds[i] = dataHolder.parseInt32();
            modelAttributes[i] = dataHolder.parseDict();
        }

        debugLog("  nodeId = " + nodeId);
        debugLog("  nodeAttributes", nodeAttributes);
        debugLog("  numOfModels = " + numOfModels);
        debugLog("  modelIds", modelIds);
        debugLog("  modelAttributes", modelAttributes);
    };

    var contentsOfMaterialExChunk = function(dataHolder) {
        var materialId = dataHolder.parseInt32();
        var properties = dataHolder.parseDict();

        debugLog("  materialId = " + materialId);
        debugLog("  properties", properties);
    };

    var unsupportedChunkType = function(dataHolder) {};

    var logFloat = function(bytes) {
        var bin = bytes.toString(2);
        while(bin.length < 32) {
            bin = "0" + bin;
        }
        var sign = bin[0] == "0" ? 1 : -1;
        var exponent = Number.parseInt(bin.substring(1, 9), 2) - 127;
        var fraction = Number.parseFloat("1." + Number.parseInt(bin.substring(9), 2));
        return sign * Math.pow(2, exponent) * fraction;
    };

    var debugLog = function(arg0, arg1) {
        // console.debug(arg0, arg1);
    };

})();
