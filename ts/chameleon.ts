/// <reference path="./three.d.ts" />

module Chameleon {
    export function create(geometry: THREE.Geometry, canvas?: HTMLCanvasElement) {
        return new Controls(geometry, canvas);
    }

    export interface Box {
        left: number;
        top: number;
        width: number;
        height: number;
    }

    var mousePositionInCanvas = (() => {
        var vector = new THREE.Vector2();
        return (event: MouseEvent,
                canvasBox: Box,
                normalize: boolean = false): THREE.Vector2 => {
            vector.set(
                event.pageX - canvasBox.left,
                event.pageY - canvasBox.top
            );
            if (normalize) {
                vector.x /= canvasBox.width;
                vector.y /= canvasBox.height;
            }
            return vector;
        };
    })();

    var mouseProjectionOnBall = (() => {
        var projGlobal = new THREE.Vector3(),
            projLocal = new THREE.Vector3();
        var upFactor = new THREE.Vector3(),
            eyeFactor = new THREE.Vector3(),
            sideFactor = new THREE.Vector3();

        return (event: MouseEvent,
                canvasBox: Box,
                up: THREE.Vector3,
                eye: THREE.Vector3): THREE.Vector3 => {
            projLocal.set(
                (event.pageX - canvasBox.width * 0.5 - canvasBox.left) / (canvasBox.width * .5),
                (canvasBox.height * 0.5 + canvasBox.top - event.pageY) / (canvasBox.height * .5),
                0.0
            );

            var lengthSq = projLocal.lengthSq();
            if (lengthSq > 1.0) {
                projLocal.normalize();
            } else {
                projLocal.z = Math.sqrt(1.0 - lengthSq);
            }

            sideFactor.copy(up).cross(eye).setLength(projLocal.x);
            upFactor.copy(up).setLength(projLocal.y);
            eyeFactor.copy(eye).setLength(projLocal.z);

            return projGlobal.copy(sideFactor).add(upFactor).add(eyeFactor);
        };
    })();

    var _brushSize;
    var _brushType;
    var _brushColor;
    var _brushTexture;

    export function changeBrushSize(_size: number) {
        _brushSize = _size;
    }

    export function changeBrushType(_type) {
        _brushType = _type;
    }

    export function changeBrushColor(_color) {
        _brushColor = _color;
    }

    export function changeTextureType(_texture) {
        _brushTexture = _texture;
    }

    enum CameraControlsState {
        Idle, Pan, Rotate
    }

    class CameraControlsBase {
        rotateSpeed: number = 1.5;
        panSpeed: number = 0.8;
        zoomSpeed: number = 1.2;

        _state: CameraControlsState = CameraControlsState.Idle;
        _eye: THREE.Vector3 = new THREE.Vector3();
        _target: THREE.Vector3 = new THREE.Vector3();
        _rotateStart: THREE.Vector3 = new THREE.Vector3();
        _rotateEnd: THREE.Vector3 = new THREE.Vector3();
        _zoomStart: number = 0;
        _zoomEnd: number = 0;
        _panStart: THREE.Vector2 = new THREE.Vector2();
        _panEnd: THREE.Vector2 = new THREE.Vector2();

        _getMousePositionInCanvas(event: MouseEvent) {
            return mousePositionInCanvas(event, this.canvasBox, true);
        }

        _getMouseProjectionOnBall(event: MouseEvent) {
            return mouseProjectionOnBall(event, this.canvasBox, this.camera.up, this._eye);
        }

        constructor(public camera: THREE.Camera,
                    public canvasBox: Box) {
        }

        rotateCamera = (() => {
            var axis = new THREE.Vector3(),
                quaternion = new THREE.Quaternion();

            return () => {
                var angle = Math.acos(
                    this._rotateStart.dot(this._rotateEnd) / this._rotateStart.length() / this._rotateEnd.length()
                );
                if (angle) {
                    axis.crossVectors(this._rotateStart, this._rotateEnd).normalize();
                    angle *= this.rotateSpeed;
                    quaternion.setFromAxisAngle(axis, -angle);

                    this._eye.applyQuaternion(quaternion);
                    this.camera.up.applyQuaternion(quaternion);

                    this._rotateEnd.applyQuaternion(quaternion);
                    this._rotateStart.copy(this._rotateEnd);
                }
            }
        })();

        zoomCamera() {
            // To be implemented by subclasses
        }

        panCamera = (() => {
            var mouseChange = new THREE.Vector2(),
                cameraUp = new THREE.Vector3(),
                pan = new THREE.Vector3();

            return () => {
                mouseChange.subVectors(this._panEnd, this._panStart);
                if (mouseChange.lengthSq()) {
                    mouseChange.multiplyScalar(this._eye.length() * this.panSpeed);
                    pan.crossVectors(this._eye, this.camera.up).setLength(mouseChange.x).add(
                        cameraUp.copy(this.camera.up).setLength(mouseChange.y)
                    );
                    this.camera.position.add(pan);
                    this._target.add(pan);
                    this._panStart.copy(this._panEnd);
                }
            }
        })();

        updateCamera() {
            this._eye.subVectors(this.camera.position, this._target);

            this.rotateCamera();
            this.zoomCamera();
            this.panCamera();

            this.camera.position.addVectors(this._target, this._eye);
            this.camera.lookAt(this._target);
        }


        onMouseDown = (event: MouseEvent) => {
            switch (event.button) {
                case 0: // Left button
                    this._state = CameraControlsState.Rotate;
                    this._rotateStart.copy(this._getMouseProjectionOnBall(event));
                    this._rotateEnd.copy(this._rotateStart);
                    break;
                case 2: // Right button
                    this._state = CameraControlsState.Pan;
                    this._panStart.copy(this._getMousePositionInCanvas(event));
                    this._panEnd.copy(this._panStart);
                    break;
                default:
                    debugger;
            }
        };

        onMouseMove = (event: MouseEvent) => {
            switch (this._state) {
                case CameraControlsState.Rotate:
                    this._rotateEnd.copy(this._getMouseProjectionOnBall(event));
                    break;
                case CameraControlsState.Pan:
                    this._panEnd.copy(this._getMousePositionInCanvas(event));
                    break;
                default:
                    debugger;
            }
        };

        onMouseUp = (event: MouseEvent) => {
            this._state = CameraControlsState.Idle;
        };

        onMouseWheel = (event: MouseWheelEvent) => {
            var delta = 0;

            if (event.wheelDelta) { // WebKit / Opera / Explorer 9
                delta = event.wheelDelta / 40;
            } else if (event.detail) { // Firefox
                delta = -event.detail / 3;
            }
            this._zoomStart += delta * 0.01;
        };
    }

    /**
     * A simplification of THREE.TrackballControls from the three.js examples
     */
    class PerspectiveCameraControls extends CameraControlsBase {
        zoomCamera() {
            var factor = 1.0 + (this._zoomEnd - this._zoomStart) * this.zoomSpeed;
            if (factor !== 1.0 && factor > 0.0) {
                this._eye.multiplyScalar(factor);
                this._zoomStart = this._zoomEnd;
            }
        }

        handleResize() {
            this.camera.aspect = this.canvasBox.width / this.canvasBox.height;
            this.camera.updateProjectionMatrix();
        }

        constructor(public camera: THREE.PerspectiveCamera,
                    public canvasBox: Box) {
            super(camera, canvasBox);
        }
    }

    /**
     * A simplification of THREE.OrthographicTrackballControls from the three.js examples
     */
    class OrthographicCameraControls extends CameraControlsBase {
        private _center0: THREE.Vector2;
        private _viewSize: number;

        private _zoomFactor: number;

        zoomCamera() {
            var factor = 1.0 + (this._zoomEnd - this._zoomStart) * this.zoomSpeed;
            if (factor !== 1.0 && factor > 0.0) {
                this.camera.zoom *= factor;
                this._zoomStart = this._zoomEnd;
                this.camera.updateProjectionMatrix();
            }
        }

        handleResize() {
            if (this.canvasBox.width < this.canvasBox.height) {
                this.camera.left = this._center0.x - this._viewSize / 2;
                this.camera.right = this._center0.x + this._viewSize / 2;

                var ratio = this.canvasBox.height / this.canvasBox.width;
                this.camera.top = this._center0.y + this._viewSize / 2 * ratio;
                this.camera.bottom = this._center0.y - this._viewSize / 2 * ratio;
            } else {
                this.camera.top = this._center0.y + this._viewSize / 2;
                this.camera.bottom = this._center0.y - this._viewSize / 2;

                var ratio = this.canvasBox.width / this.canvasBox.height;
                this.camera.left = this._center0.x - this._viewSize / 2 * ratio;
                this.camera.right = this._center0.x + this._viewSize / 2 * ratio;
            }

            this.camera.updateProjectionMatrix();
        }

        constructor(public camera: THREE.OrthographicCamera,
                    public canvasBox: Box) {
            super(camera, canvasBox);
            this._center0 = new THREE.Vector2(
                (camera.left + camera.right) / 2,
                (camera.top + camera.bottom) / 2
            );
            this._viewSize = Math.min(
                this._center0.x - camera.left,
                camera.right - this._center0.x,
                this._center0.y - camera.bottom,
                camera.top - this._center0.y
            );
            this.handleResize();
        }
    }

    enum ControlsState {
        Idle, Draw, View
    }

    function showCanvasInNewWindow(canvas: HTMLCanvasElement) {
        var dataURL = canvas.toDataURL("image/png");
        var newWindow = window.open();
        newWindow.document.write('<img style="border:1px solid black" src="' + dataURL + '"/>');
    }

    class AffectedFacesRecorder {
        private _nAffectedFaces: number = 0;
        private _affectedFaces: Uint32Array;
        private _isFaceAffected: Uint8Array; // Used as if it's a boolean array
        private _isFaceAffectedEmpty: Uint8Array; // Used to clear _isFaceAffected. Should not be modified once initialized.

        constructor(nFaces: number) {
            this._affectedFaces = new Uint32Array(nFaces);
            this._isFaceAffected = new Uint8Array(nFaces);
            this._isFaceAffectedEmpty = new Uint8Array(nFaces);
        }

        add(faceIndex: number) {
            if (!this._isFaceAffected[faceIndex]) {
                this._isFaceAffected[faceIndex] = 1;
                this._affectedFaces[this._nAffectedFaces] = faceIndex;
                this._nAffectedFaces += 1;
            }
        }

        reset() {
            this._nAffectedFaces = 0;
            this._isFaceAffected.set(this._isFaceAffectedEmpty);
        }

        forEach(f: (int) => any) {
            for (var i = 0; i < this._nAffectedFaces; i += 1) {
                f(this._affectedFaces[i]);
            }
        }

        get length(): number {
            return this._nAffectedFaces;
        }

        contains(faceIndex: number): boolean {
            return !!this._isFaceAffected[faceIndex];
        }
    }

    /**
     * Manages both the viewing texture and the drawing texture
     */
    class TextureManager {
        private _viewingTextureUvs: THREE.Vector2[][];
        private _viewingMaterial: THREE.MeshFaceMaterial;
        private _drawingTextureUvs: THREE.Vector2[][];
        private _drawingCanvas: HTMLCanvasElement;
        private _drawingMaterial: THREE.MeshLambertMaterial;
        private _drawingTextureMesh: THREE.Mesh;
        private _drawingTextureScene: THREE.Scene;
        private _drawingVertexUvs: THREE.Vector2[];
        private _affectedFaces: AffectedFacesRecorder;
        private _isFloodFillEmpty: Uint8Array;
        private _isFloodFill: Uint8Array;
        private _nAdjacentFaces: Uint8Array;
        private _AdjacentFacesList: Uint32Array[];

        get drawingContext() {
            return this._drawingCanvas.getContext('2d');
        }

        get drawingCanvas() {
            return this._drawingCanvas;
        }

        initializeViewingTexture(): TextureManager {
            var singlePixelCanvas = <HTMLCanvasElement>document.createElement('canvas');
            singlePixelCanvas.width = singlePixelCanvas.height = 1;
            var context = singlePixelCanvas.getContext('2d');
            context.fillStyle = '#FFFFFF';
            context.fillRect(0, 0, 1, 1);

            this._viewingTextureUvs = [];
            var faces = this.geometry.faces;
            this._viewingMaterial = new THREE.MeshFaceMaterial();
            for (var i = 0; i < faces.length; i += 1) {
                // Set the materialIndex to be the face index
                // TextureManager requires this special treatment to work
                faces[i].materialIndex = i;
                this._viewingTextureUvs.push([
                    new THREE.Vector2(0.5, 0.5),
                    new THREE.Vector2(0.5, 0.5),
                    new THREE.Vector2(0.5, 0.5)
                ]);

                var lambertMaterial = new THREE.MeshLambertMaterial({map: new THREE.Texture(singlePixelCanvas)});
                lambertMaterial.map.needsUpdate = true;
                this._viewingMaterial.materials.push(lambertMaterial);
            }

            return this;
        }

        // Depends on the initialization of viewing texture
        initializeDrawingTexture(): TextureManager {
            this._drawingVertexUvs = [];
            for (var i = 0; i < this.geometry.vertices.length; i += 1) {
                this._drawingVertexUvs.push(new THREE.Vector2());
            }

            this._drawingTextureUvs = [];
            var faces = this.geometry.faces;
            for (var i = 0; i < faces.length; i += 1) {
                this._drawingTextureUvs.push([
                    new THREE.Vector2(),
                    new THREE.Vector2(),
                    new THREE.Vector2()
                ]);
            }

            this._drawingCanvas = document.createElement('canvas');
            this._drawingMaterial = new THREE.MeshLambertMaterial({
                map: new THREE.Texture(this._drawingCanvas)
            });
            this._drawingTextureMesh = new THREE.Mesh(this.geometry, this._viewingMaterial);

            this._drawingTextureScene = new THREE.Scene();
            this._drawingTextureScene.add(new THREE.AmbientLight(0xFFFFFF));
            this._drawingTextureScene.add(this._drawingTextureMesh);

            return this;
        }

        prepareViewingTexture(): TextureManager {
            if (this._affectedFaces.length > 0) {
                var uMax = Number.NEGATIVE_INFINITY,
                    uMin = Number.POSITIVE_INFINITY,
                    vMax = Number.NEGATIVE_INFINITY,
                    vMin = Number.POSITIVE_INFINITY;

                this._affectedFaces.forEach((faceIndex) => {
                    var drawingUvs = this._drawingTextureUvs[faceIndex];
                    uMax = Math.max(uMax, drawingUvs[0].x, drawingUvs[1].x, drawingUvs[2].x);
                    uMin = Math.min(uMin, drawingUvs[0].x, drawingUvs[1].x, drawingUvs[2].x);
                    vMax = Math.max(vMax, drawingUvs[0].y, drawingUvs[1].y, drawingUvs[2].y);
                    vMin = Math.min(vMin, drawingUvs[0].y, drawingUvs[1].y, drawingUvs[2].y);
                });

                var xMax = uMax * this._drawingCanvas.width,
                    xMin = uMin * this._drawingCanvas.width,
                    yMax = (1 - vMin) * this._drawingCanvas.height,
                    yMin = (1 - vMax) * this._drawingCanvas.height;

                this.drawingContext.rect(xMin, yMin, xMax, yMax);
                this.drawingContext.clip();
                var patchCanvas = <HTMLCanvasElement>document.createElement('canvas');
                patchCanvas.width = xMax - xMin;
                patchCanvas.height = yMax - yMin;
                patchCanvas.getContext('2d').drawImage(
                    this._drawingCanvas,
                    xMin, yMin, patchCanvas.width, patchCanvas.height,
                    0, 0, patchCanvas.width, patchCanvas.height
                );

                this._affectedFaces.forEach((faceIndex) => {
                    var faceMaterial = <THREE.MeshLambertMaterial>this._viewingMaterial.materials[faceIndex];
                    faceMaterial.map.image = patchCanvas;
                    faceMaterial.map.needsUpdate = true;

                    var drawingUvs = this._drawingTextureUvs[faceIndex];
                    var viewingUvs = this._viewingTextureUvs[faceIndex];
                    for (var j = 0; j < 3; j += 1) {
                        var drawingUV = drawingUvs[j];
                        viewingUvs[j].setX(
                            (drawingUV.x - uMin) * (this._drawingCanvas.width) / patchCanvas.width
                        ).setY(
                            (drawingUV.y - vMin) * (this._drawingCanvas.height) / patchCanvas.height
                        );
                    }
                });

                this._affectedFaces.reset();
            }

            return this;
        }

        applyViewingTexture(mesh: THREE.Mesh): TextureManager {
            mesh.material = this._viewingMaterial;
            mesh.geometry.faceVertexUvs[0] = this._viewingTextureUvs;
            mesh.geometry.uvsNeedUpdate = true;

            return this;
        }

        prepareDrawingTexture(): TextureManager {
            this.renderer.render(this._drawingTextureScene, this.camera);
            this._drawingCanvas.width = this.renderer.domElement.width;
            this._drawingCanvas.height = this.renderer.domElement.height;
            this.drawingContext.drawImage(this.renderer.domElement, 0, 0);
            this._drawingMaterial.map.needsUpdate = true;

            var projectedPosition = new THREE.Vector3();
            for (var i = 0; i < this.geometry.vertices.length; i += 1) {
                projectedPosition.copy(this.geometry.vertices[i]).project(this.camera);
                this._drawingVertexUvs[i].setX(
                    (projectedPosition.x + 1) / 2
                ).setY(
                    (projectedPosition.y + 1) / 2
                );
            }
            for (var i = 0; i < this.geometry.faces.length; i += 1) {
                this._drawingTextureUvs[i][0].copy(this._drawingVertexUvs[this.geometry.faces[i].a]);
                this._drawingTextureUvs[i][1].copy(this._drawingVertexUvs[this.geometry.faces[i].b]);
                this._drawingTextureUvs[i][2].copy(this._drawingVertexUvs[this.geometry.faces[i].c]);
            }

            return this;
        }

        applyDrawingTexture(mesh: THREE.Mesh): TextureManager {
            mesh.material = this._drawingMaterial;
            mesh.geometry.faceVertexUvs[0] = this._drawingTextureUvs;
            mesh.geometry.uvsNeedUpdate = true;

            return this;
        }

        private _castRayFromMouse(canvasPos: THREE.Vector2): THREE.Intersection[] {
            var mouse3d = new THREE.Vector3(
                canvasPos.x / this._drawingCanvas.width * 2 - 1,
                -canvasPos.y / this._drawingCanvas.height * 2 + 1,
                -10000
            ).unproject(this.camera);

            var direction = new THREE.Vector3(0, 0, -1).transformDirection(this.camera.matrixWorld);

            return new THREE.Raycaster(
                mouse3d,
                direction
            ).intersectObject(this._drawingTextureMesh);
        }

        private _pointCircleCollide(point, circle, r) {
            if (r === 0) return false;
            var dx = circle.x - point.x;
            var dy = circle.y - point.y;
            return dx * dx + dy * dy <= r * r;
        }

        private _lineCircleCollide(a, b, circle, radius) {
            //check to see if start or end points lie within circle 
            if (this._pointCircleCollide(a, circle, radius)) {
                return true;
            }

            if (this._pointCircleCollide(b, circle, radius)) {
                return true;
            }

            var x1 = a.x, y1 = a.y,
                x2 = b.x, y2 = b.y,
                cx = circle.x, cy = circle.y;

            //vector d
            var dx = x2 - x1;
            var dy = y2 - y1;

            //vector lc
            var lcx = cx - x1;
            var lcy = cy - y1;

            //project lc onto d, resulting in vector p
            var dLen2 = dx * dx + dy * dy; //len2 of d
            var px = dx;
            var py = dy;
            if (dLen2 > 0) {
                var dp = (lcx * dx + lcy * dy) / dLen2;
                px *= dp;
                py *= dp;
            }

            var nearest = [x1 + px, y1 + py];

            //len2 of p
            var pLen2 = px * px + py * py;

            //check collision
            return this._pointCircleCollide(nearest, circle, radius)
                && pLen2 <= dLen2 && (px * dx + py * dy) >= 0;
        }

        private _pointInTriangle(point, t0, t1, t2) {
            //compute vectors & dot products
            var cx = point.x, cy = point.y,
                v0x = t2.x - t0.x, v0y = t2.y - t0.y,
                v1x = t1.x - t0.x, v1y = t1.y - t0.y,
                v2x = cx - t0.x, v2y = cy - t0.y,
                dot00 = v0x * v0x + v0y * v0y,
                dot01 = v0x * v1x + v0y * v1y,
                dot02 = v0x * v2x + v0y * v2y,
                dot11 = v1x * v1x + v1y * v1y,
                dot12 = v1x * v2x + v1y * v2y;

            // Compute barycentric coordinates
            var b = (dot00 * dot11 - dot01 * dot01),
                inv = b === 0 ? 0 : (1 / b),
                u = (dot11 * dot02 - dot01 * dot12) * inv,
                v = (dot00 * dot12 - dot01 * dot02) * inv;
            return u >= 0 && v >= 0 && (u + v <= 1);
        }

        private _add_recursive(faceIndex: number, center: THREE.Vector2, radius: number) {
            if (faceIndex >= 0 && !this._isFloodFill[faceIndex]) {
                var v1 = new THREE.Vector2();
                v1.copy(this._drawingTextureUvs[faceIndex][0]);
                var v2 = new THREE.Vector2();
                v2.copy(this._drawingTextureUvs[faceIndex][1]);
                var v3 = new THREE.Vector2();
                v3.copy(this._drawingTextureUvs[faceIndex][2]);
                v1.x = v1.x * this._drawingCanvas.width;
                v1.y = (1 - v1.y) * this._drawingCanvas.height;
                v2.x = v2.x * this._drawingCanvas.width;
                v2.y = (1 - v2.y) * this._drawingCanvas.height;
                v3.x = v3.x * this._drawingCanvas.width;
                v3.y = (1 - v3.y) * this._drawingCanvas.height;

                var inside = this._pointInTriangle(center, v1, v2, v3);
                var collide1 = this._lineCircleCollide(v1, v2, center, radius);
                var collide2 = this._lineCircleCollide(v2, v3, center, radius);
                var collide3 = this._lineCircleCollide(v3, v1, center, radius);
                if (inside || collide1 || collide2 || collide3) {
                    this._isFloodFill[faceIndex] = 1;
                    this._affectedFaces.add(faceIndex);
                    for (var i = 0; i < this._nAdjacentFaces[faceIndex]; i += 1) {
                        var newfaceIndex = this._AdjacentFacesList[faceIndex][i];
                        var cameradirection = new THREE.Vector3();
                        cameradirection.copy(this.camera.position);
                        cameradirection.normalize();
                        if (this.geometry.faces[newfaceIndex].normal.dot(cameradirection) > 0) {
                            this._add_recursive(newfaceIndex, center, radius);
                        }
                    }
                }
            }
        }

        public onStrokePainted(canvasPos: THREE.Vector2, radius: number): TextureManager {
            var intersections = this._castRayFromMouse(canvasPos);
            if (intersections.length > 0) {
                this._drawingMaterial.map.needsUpdate = true;
                var faceIndex = intersections[0].face.materialIndex;
                //this._affectedFaces.add(faceIndex);

                // TODO use radius to find all affected triangles
                this._isFloodFill.set(this._isFloodFillEmpty);
                this._add_recursive(faceIndex, canvasPos, radius);
                console.log(this._isFloodFill);
                console.log(this._affectedFaces);

            }

            return this;
        }

        // Assumption on geometry: material indices are same to face indices.
        // This special treatment is implemented in the constructor of Controls
        constructor(public geometry: THREE.Geometry,
                    public renderer: THREE.Renderer,
                    public camera: THREE.OrthographicCamera) {

            this._affectedFaces = new AffectedFacesRecorder(this.geometry.faces.length);
            this.initializeViewingTexture().initializeDrawingTexture();

            this._isFloodFillEmpty = new Uint8Array(this.geometry.faces.length);
            this._isFloodFill = new Uint8Array(this.geometry.faces.length);
            this._nAdjacentFaces = new Uint8Array(this.geometry.faces.length);
            this._AdjacentFacesList = new Array(this.geometry.faces.length);
            for (var i = 0; i < this.geometry.faces.length; i += 1) {
                this._AdjacentFacesList[i] = new Uint32Array(this.geometry.faces.length);
            }
            for (var i = 0; i < this.geometry.faces.length - 1; i += 1) {
                for (var j = i + 1; j < this.geometry.faces.length; j += 1) {
                    var vi = [this.geometry.faces[i].a, this.geometry.faces[i].b, this.geometry.faces[i].c];
                    var vj = [this.geometry.faces[j].a, this.geometry.faces[j].b, this.geometry.faces[j].c];
                    var count = 0;
                    for (var k = 0; k < 3; k++)
                        for (var l = 0; l < 3; l++)
                            if (this.geometry.vertices[vi[k]].x == this.geometry.vertices[vj[l]].x &&
                                this.geometry.vertices[vi[k]].y == this.geometry.vertices[vj[l]].y &&
                                this.geometry.vertices[vi[k]].z == this.geometry.vertices[vj[l]].z &&
                                this.geometry.faces[i].normal.dot(this.geometry.faces[j].normal) > 0)
                                count++;
                    if (count == 2) {
                        this._AdjacentFacesList[i][this._nAdjacentFaces[i]] = j;
                        this._AdjacentFacesList[j][this._nAdjacentFaces[j]] = i;
                        this._nAdjacentFaces[i] += 1;
                        this._nAdjacentFaces[j] += 1;
                    }
                }
            }
            console.log(this._nAdjacentFaces);
            console.log(this._AdjacentFacesList);
        }
    }

    export interface Brush {
        radius: number;
        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2);
        continueStoke(position: THREE.Vector2);
        finishStroke();
    }

    export class Pencil implements Brush {
        get radius(): number {
            return 1;
        }

        private _canvasContext: CanvasRenderingContext2D = null;

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.save(); // Assumption: nobody else will call this until the stroke is finished

            this._canvasContext.moveTo(position.x, position.y);
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._canvasContext.lineTo(position.x, position.y);
                this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }
    }

    export class Pencil1 implements Brush {
        get radius(): number {
            return this._pencilSize;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilColor;


        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.beginPath();
            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished
            this._canvasContext.lineWidth = this._pencilSize;
            this._canvasContext.strokeStyle = this._pencilColor;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this._canvasContext.moveTo(position.x, position.y);
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._canvasContext.lineTo(position.x, position.y);
                this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilColor = _brushColor
        }
    }

    export class Pencil2 implements Brush {
        get radius(): number {
            return this._pencilSize;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilColor;

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.beginPath();
            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished


            this._canvasContext.lineWidth = this._pencilSize;
            this._canvasContext.strokeStyle = this._pencilColor;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this._canvasContext.shadowBlur = this._pencilSize;
            this._canvasContext.shadowColor = this._pencilColor;
            this._canvasContext.moveTo(position.x, position.y);
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._canvasContext.lineTo(position.x, position.y);
                this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilColor = _brushColor
        }
    }
    export class Pencil3 implements Brush {
        get radius(): number {
            return 32;
        }

        private img = new Image();


        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;

        distanceBetween(point1, point2) {
            return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
        }

        angleBetween(point1, point2) {
            return Math.atan2(point2.x - point1.x, point2.y - point1.y);
        }

        private lastPoint;

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.beginPath();
            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished
            this.img.src = 'image/brush3.png';
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this.lastPoint = {x: position.x, y: position.y};
            //this._canvasContext.moveTo(position.x, position.y);
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                //this._canvasContext.lineTo(position.x, position.y);

                var currentPoint = {x: position.x, y: position.y};
                var dist = this.distanceBetween(this.lastPoint, currentPoint);
                var angle = this.angleBetween(this.lastPoint, currentPoint);

                for (var i = 0; i < dist; i++) {
                    var x = this.lastPoint.x + (Math.sin(angle) * i) - 25;
                    var y = this.lastPoint.y + (Math.cos(angle) * i) - 25;
                    this._canvasContext.drawImage(this.img, x, y);
                }

                this.lastPoint = currentPoint;

                //this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
        }
    }
    export class Pencil4 implements Brush {
        get radius(): number {
            return 10;
        }

        private img = new Image();


        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;


        distanceBetween(point1, point2) {
            return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
        }

        angleBetween(point1, point2) {
            return Math.atan2(point2.x - point1.x, point2.y - point1.y);
        }

        getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        private lastPoint;

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.beginPath();
            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished
            this.img.src = 'image/brush3.png';
            this.img.width = 10;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this.lastPoint = {x: position.x, y: position.y};

        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                //this._canvasContext.lineTo(position.x, position.y);

                var currentPoint = {x: position.x, y: position.y};
                var dist = this.distanceBetween(this.lastPoint, currentPoint);
                var angle = this.angleBetween(this.lastPoint, currentPoint);

                for (var i = 0; i < dist; i++) {
                    var x = this.lastPoint.x + (Math.sin(angle) * i);
                    var y = this.lastPoint.y + (Math.cos(angle) * i);
                    this._canvasContext.save();
                    this._canvasContext.translate(x, y);
                    this._canvasContext.scale(0.5, 0.5);
                    this._canvasContext.rotate(Math.PI * 180 / this.getRandomInt(0, 180));
                    this._canvasContext.drawImage(this.img, 0, 0);
                    this._canvasContext.restore();
                }

                this.lastPoint = currentPoint;

                //this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
        }
    }
    export class Pencil5 implements Brush {
        get radius(): number {
            return 3;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize = 3;
        private _pencilColor;
        private _lastPoint;


        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');

            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished
            this._canvasContext.lineWidth = this._pencilSize;
            this._canvasContext.strokeStyle = this._pencilColor;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this._lastPoint = {x: position.x, y: position.y};
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._canvasContext.beginPath();
                this._canvasContext.globalAlpha = 1;
                this._canvasContext.moveTo(this._lastPoint.x, this._lastPoint.y);
                this._canvasContext.lineTo(position.x, position.y);
                this._canvasContext.stroke();

                this._canvasContext.moveTo(this._lastPoint.x - 4, this._lastPoint.y - 4);
                this._canvasContext.lineTo(position.x - 4, position.y - 4);
                this._canvasContext.stroke();

                this._canvasContext.moveTo(this._lastPoint.x - 2, this._lastPoint.y - 2);
                this._canvasContext.lineTo(position.x - 2, position.y - 2);
                this._canvasContext.stroke();

                this._canvasContext.moveTo(this._lastPoint.x + 2, this._lastPoint.y + 2);
                this._canvasContext.lineTo(position.x + 2, position.y + 2);
                this._canvasContext.stroke();

                this._canvasContext.moveTo(this._lastPoint.x + 4, this._lastPoint.y + 4);
                this._canvasContext.lineTo(position.x + 4, position.y + 4);
                this._canvasContext.stroke();

                this._lastPoint = {x: position.x, y: position.y};
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
            }
        }

        constructor() {

            this._pencilColor = _brushColor;
        }
    }
    export class Pencil6 implements Brush {
        get radius(): number {
            return 15;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilColor;
        private _points = [];
        private _radius;


        getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished

            this._canvasContext.fillStyle = this._pencilColor;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this._points.push({
                x: position.x,
                y: position.y,
                radius: this.getRandomInt(10, 30),
                opacity: Math.random()
            });
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {

                this._points.push({
                    x: position.x,
                    y: position.y,
                    radius: this.getRandomInt(5, 20),
                    opacity: Math.random()
                });

                this._canvasContext.clearRect(0, 0, 1, 1);
                for (var i = 0; i < this._points.length; i++) {
                    this._canvasContext.beginPath();
                    this._canvasContext.globalAlpha = this._points[i].opacity;
                    this._canvasContext.arc(
                        this._points[i].x, this._points[i].y, this._points[i].radius, 30, 270,
                        false);

                    this._canvasContext.fill();
                }
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
                this._points.length = 0;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilColor = _brushColor;
        }
    }
    export class Pencil7 implements Brush {
        get radius(): number {
            return this._pencilSize;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilColor;
        private _points = [];

        drawStar(x, y, angle) {
            var length = this._pencilSize;
            this._canvasContext.save();
            this._canvasContext.translate(x, y);
            this._canvasContext.beginPath();
            this._canvasContext.rotate(Math.PI / 180 * angle);
            for (var i = 5; i--;) {
                this._canvasContext.lineTo(0, length);
                this._canvasContext.translate(0, length);
                this._canvasContext.rotate((Math.PI * 2 / 10));
                this._canvasContext.lineTo(0, -length);
                this._canvasContext.translate(0, -length);
                this._canvasContext.rotate(-(Math.PI * 6 / 10));
            }
            this._canvasContext.lineTo(0, length);
            this._canvasContext.closePath();
            this._canvasContext.stroke();
            this._canvasContext.restore();
        }

        getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {

            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.save();
            this._canvasContext.strokeStyle = this._pencilColor;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';

        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._points.push({x: position.x, y: position.y, angle: this.getRandomInt(0, 180)});

                this._canvasContext.clearRect(0, 0, 1, 1);
                for (var i = 0; i < this._points.length; i++) {
                    this.drawStar(this._points[i].x, this._points[i].y, this._points[i].angle);
                }
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._points.length = 0;
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilColor = _brushColor;
        }
    }
    export class Pencil8 implements Brush {
        get radius(): number {
            return this._pencilSize;
        }

        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilColor;
        private _points = [];

        drawStar(options) {
            var length = this._pencilSize;
            this._canvasContext.save();
            this._canvasContext.translate(options.x, options.y);
            this._canvasContext.beginPath();
            this._canvasContext.globalAlpha = options.opacity;
            this._canvasContext.rotate(Math.PI / 180 * options.angle);
            this._canvasContext.scale(options.scale, options.scale);
            this._canvasContext.strokeStyle = options.color;
            this._canvasContext.lineWidth = options.width;
            for (var i = 5; i--;) {
                this._canvasContext.lineTo(0, length);
                this._canvasContext.translate(0, length);
                this._canvasContext.rotate((Math.PI * 2 / 10));
                this._canvasContext.lineTo(0, -length);
                this._canvasContext.translate(0, -length);
                this._canvasContext.rotate(-(Math.PI * 6 / 10));
            }
            this._canvasContext.lineTo(0, length);
            this._canvasContext.closePath();
            this._canvasContext.stroke();
            this._canvasContext.restore();
        }

        getRandomInt(min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        addRandomPoint(position) {
            this._points.push({
                x: position.x,
                y: position.y,
                angle: this.getRandomInt(0, 180),
                width: this.getRandomInt(1, 10),
                opacity: Math.random(),
                scale: this.getRandomInt(1, 20) / 10,
                color: ('rgb(' + this.getRandomInt(0, 255) + ',' + this.getRandomInt(0, 255) + ',' + this.getRandomInt(0, 255) + ')')
            });
        }

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {

            this._canvasContext = canvas.getContext('2d');
            this._canvasContext.save();

        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this.addRandomPoint(position);

                this._canvasContext.clearRect(0, 0, 1, 1);
                for (var i = 0; i < this._points.length; i++) {
                    this.drawStar(this._points[i]);
                }
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._points.length = 0;
                this._canvasContext = null;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilColor = _brushColor;
        }
    }
    export class Pencil9 implements Brush {
        get radius(): number {
            return _brushSize;
        }

        private img = new Image();
        private _canvasContext: CanvasRenderingContext2D = null;
        private _pencilSize;
        private _pencilTexture;
        private lastPoint;

        midPointBtw(p1, p2) {
            return {
                x: p1.x + (p2.x - p1.x) / 2,
                y: p1.y + (p2.y - p1.y) / 2
            };
        }

        getPattern() {
            var patternCanvas = document.createElement('canvas'),
                dotWidth = 400,
                dotDistance = 200,
                patternCtx = patternCanvas.getContext('2d');

            patternCanvas.width = patternCanvas.height = dotWidth + dotDistance;

            if (this._pencilTexture == "grass") {
                this.img.src = 'image/grass_texture.jpg'
            }
            if (this._pencilTexture == "metal") {
                this.img.src = 'image/metal_texture.jpg'
            }
            if (this._pencilTexture == "rock") {
                this.img.src = 'image/rock_texture.jpg'
            }
            if (this._pencilTexture == "blackleather") {
                this.img.src = 'image/blackleather_texture.jpg'
            }


            patternCtx.beginPath();
            patternCtx.arc(dotWidth, dotWidth, dotWidth, 0, Math.PI * 2, false);
            patternCtx.closePath();
            patternCtx.drawImage(this.img, 0, 0);
            return this._canvasContext.createPattern(patternCanvas, 'repeat');
        }

        private _points = [];

        startStroke(canvas: HTMLCanvasElement, position: THREE.Vector2) {
            this._canvasContext = canvas.getContext('2d');

            this._canvasContext.save(); // Assumption: nobody        else will call this until the stroke is finished
            this._canvasContext.lineWidth = this._pencilSize;
            this._canvasContext.lineJoin = this._canvasContext.lineCap = 'round';
            this._canvasContext.strokeStyle = this.getPattern();
            this.lastPoint = {x: position.x, y: position.y};
            //this._canvasContext.moveTo(position.x, position.y);
        }

        continueStoke(position: THREE.Vector2) {
            if (this._canvasContext) {
                this._points.push({x: position.x, y: position.y});

                this._canvasContext.clearRect(0, 0, 1, 1);

                var p1 = this._points[0];
                var p2 = this._points[1];

                this._canvasContext.beginPath();
                this._canvasContext.moveTo(p1.x, p1.y);

                for (var i = 1, len = this._points.length; i < len; i++) {
                    var midPoint = this.midPointBtw(p1, p2);
                    this._canvasContext.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
                    p1 = this._points[i];
                    p2 = this._points[i + 1];
                }
                this._canvasContext.lineTo(p1.x, p1.y);
                this._canvasContext.stroke();
            }
        }

        finishStroke() {
            if (this._canvasContext) {
                this._canvasContext.restore();
                this._canvasContext = null;
                this._points.length = 0;
            }
        }

        constructor() {
            this._pencilSize = _brushSize;
            this._pencilTexture = _brushTexture;
        }
    }

    export class Controls {

        private _state: ControlsState = ControlsState.Idle;

        private _geometry: THREE.Geometry;
        private _mesh: THREE.Mesh = new THREE.Mesh();
        canvas: HTMLCanvasElement;

        canvasBox: Box = {left: 0, top: 0, width: 0, height: 0};

        public updateCanvasBox() {
            var canvasRect = this.canvas.getBoundingClientRect();
            var docElement = this.canvas.ownerDocument.documentElement;
            this.canvasBox.left = canvasRect.left + window.pageXOffset - docElement.clientLeft;
            this.canvasBox.top = canvasRect.top + window.pageYOffset - docElement.clientTop;
            this.canvasBox.width = canvasRect.width;
            this.canvasBox.height = canvasRect.height;
        }

        private _headLight: THREE.PointLight = new THREE.PointLight(0xFFFFFF, 0.4);
        private _camera: THREE.OrthographicCamera;
        private _cameraControls: OrthographicCameraControls;

        private _scene: THREE.Scene = (() => {
            var scene = new THREE.Scene();

            var ambientLight = new THREE.AmbientLight(0x777777);
            scene.add(ambientLight);

            var light = new THREE.DirectionalLight(0xFFFFFF, 0.2);
            light.position.set(320, 390, 700);
            scene.add(light);

            var light2 = new THREE.DirectionalLight(0xFFFFFF, 0.2);
            light2.position.set(-720, -190, -300);
            scene.add(light2);

            scene.add(this._headLight);

            scene.add(this._mesh);

            return scene;
        })();

        private _renderer: THREE.Renderer = (() => {
            var renderer = new THREE.WebGLRenderer({antialias: true});
            renderer.setClearColor(0xAAAAAA, 1.0);
            return renderer;
        })();

        brush: Brush = new Pencil1();


        private _textureManager: TextureManager;
        private _usingViewingTexture: boolean;

        handleResize() {
            this._renderer.setSize(this.canvas.width, this.canvas.height);
            this.updateCanvasBox();
            this._cameraControls.handleResize();
            this._useViewingTexture();
        }


        update() {
            this._cameraControls.updateCamera();
            this._headLight.position.copy(this._camera.position);

            this._renderer.render(this._scene, this._camera);
            this.canvas.getContext('2d').drawImage(this._renderer.domElement, 0, 0);
        }

        private _useViewingTexture() {
            // If already using the viewing texture, do nothing
            if (this._usingViewingTexture) {
                return;
            }

            this._textureManager.prepareViewingTexture().applyViewingTexture(this._mesh);
            this._usingViewingTexture = true;
        }

        private _useDrawingTexture() {
            // If already using the drawing texture, do nothing
            if (!this._usingViewingTexture) {
                return;
            }

            this._textureManager.prepareDrawingTexture().applyDrawingTexture(this._mesh);
            this._usingViewingTexture = false;
        }

        private _mousedown = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (this._state !== ControlsState.Idle) {
                return;
            }

            // Hold shift key to rotate and pan
            if (event.shiftKey) {
                this._state = ControlsState.View;
                this._useViewingTexture();
                this._cameraControls.onMouseDown(event);
            } else {
                this._state = ControlsState.Draw;
                this._useDrawingTexture();

                var pos = mousePositionInCanvas(event, this.canvasBox);

                if (_brushType == "brush1") {
                    this.brush = new Pencil1();
                }
                if (_brushType == "brush2") {
                    this.brush = new Pencil2();
                }
                if (_brushType == "brush3") {
                    this.brush = new Pencil3();
                }
                if (_brushType == "brush4") {
                    this.brush = new Pencil4();
                }
                if (_brushType == "brush5") {
                    this.brush = new Pencil5();
                }
                if (_brushType == "brush6") {
                    this.brush = new Pencil6();
                }
                if (_brushType == "brush7") {
                    this.brush = new Pencil7();
                }

                if (_brushType == "brush8") {
                    this.brush = new Pencil8();
                }
                if (_brushType == "brush9") {
                    this.brush = new Pencil9();
                }

                this.brush.startStroke(this._textureManager.drawingCanvas, pos);
                this._textureManager.onStrokePainted(pos, this.brush.radius);
            }

            document.addEventListener('mousemove', this._mousemove, false);
            document.addEventListener('mouseup', this._mouseup, false);
        };

        private _mousemove = (event: MouseEvent) => {
            if (this._state === ControlsState.Idle) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            switch (this._state) {
                case ControlsState.View:
                    this._cameraControls.onMouseMove(event);
                    break;
                case ControlsState.Draw:
                    var pos = mousePositionInCanvas(event, this.canvasBox);
                    this.brush.continueStoke(pos);
                    this._textureManager.onStrokePainted(pos, this.brush.radius);
                    break;
                default:
                    debugger;
            }
        };

        private _mouseup = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();

            this.brush.finishStroke();
            this.update();
            this._cameraControls.onMouseUp(event);
            this._state = ControlsState.Idle;

            document.removeEventListener('mousemove', this._mousemove);
            document.removeEventListener('mouseup', this._mouseup);
        };

        private _mousewheel = (event: MouseWheelEvent) => {
            event.preventDefault();
            event.stopPropagation();

            if (this._state === ControlsState.Draw || !event.shiftKey) {
                return;
            }

            this._useViewingTexture();
            this._cameraControls.onMouseWheel(event);
        };

        constructor(geometry: THREE.Geometry, canvas?: HTMLCanvasElement) {
            this._geometry = geometry.clone();
            // Note that a crucial assumption is that this Mesh object will never be transformed (rotated, scaled, or translated)
            // This is crucial for both TextureManager and CameraControls to work properly
            this._mesh.geometry = this._geometry;

            if (!canvas) {
                canvas = document.createElement('canvas');
            }
            this.canvas = canvas;
            this.canvas.addEventListener('contextmenu', (e) => e.preventDefault(), false);
            this.canvas.addEventListener('mousedown', this._mousedown, false);
            this.canvas.addEventListener('mousewheel', this._mousewheel, false);
            this.canvas.addEventListener('DOMMouseScroll', this._mousewheel, false); // firefox

            var viewSize = 1;
            var origin = new THREE.Vector3(0, 0, 0);
            for (var i = 0; i < this._mesh.geometry.vertices.length; i += 1) {
                viewSize = Math.max(
                    viewSize,
                    this._mesh.geometry.vertices[i].distanceTo(origin)
                );
            }
            viewSize *= 2 * 1.25;
            this._camera = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize);
            this._camera.position.z = viewSize * 10;

            this._cameraControls = new OrthographicCameraControls(this._camera, this.canvasBox);

            this._textureManager = new TextureManager(this._geometry, this._renderer, this._camera);
            this._textureManager.applyViewingTexture(this._mesh);
            this._usingViewingTexture = true;

            this.handleResize();
            this.update();
        }

    }
}

