export class V2 {
    constructor(
        public x: number,
        public y: number,
    ) {}

    add(other: V2): V2 {
        return new V2(this.x + other.x, this.y + other.y);
    }
    sub(other: V2): V2 {
        return new V2(this.x - other.x, this.y - other.y);
    }
    rsub(other: V2): V2 {
        return new V2(other.x - this.x, other.y - this.y);
    }
    inv(): V2 {
        return new V2(1 / this.x, 1 / this.y);
    }
    mul(other: V2): V2 {
        return new V2(this.x * other.x, this.y * other.y);
    }
    round() {
        return new V2(Math.round(this.x), Math.round(this.y));
    }
}

export const v2 = (x: number, y: number = x): V2 => new V2(x, y);

export class Rect {
    constructor(
        public pos: V2,
        public size: V2,
    ) {}

    containsPoint(point: V2) {
        return (
            point.x >= this.pos.x &&
            point.x < this.pos.x + this.size.x &&
            point.y >= this.pos.y &&
            point.y < this.pos.y + this.size.y
        );
    }
}
