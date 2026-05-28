import { TileMap, WinChecker } from "./board";
import { v2 } from "./v2";

export function testBoard() {
    const map = new TileMap();

    console.assert(map.getTile(v2(0, 0)) === null);

    map.setTile("X", v2(0, 0));
    console.assert(map.getTile(v2(0, 0)) === "X");

    const checker = new WinChecker(map);
    console.assert(!checker.check(v2(0, 0), "X"));

    map.setTile("X", v2(-1, 0));
    console.assert(!checker.check(v2(0, 0), "X"));

    map.setTile("X", v2(1, 0));
    console.assert(checker.check(v2(0, 0), "X"));
    console.assert(!checker.check(v2(2, 0), "X"));
    console.assert(!checker.check(v2(1, 2), "X"));

    map.setTile("O", v2(3, 3));
    map.setTile("O", v2(4, 4));

    console.assert(!checker.check(v2(4, 4), "O"));

    map.setTile("O", v2(5, 5));
    console.assert(checker.check(v2(4, 4), "O"));
    console.assert(checker.check(v2(5, 5), "O"));
    console.assert(!checker.check(v2(5, 5), "X"));

    map.setTile("X", v2(10, 10));
    map.setTile("X", v2(11, 9));
    map.setTile("X", v2(12, 8));
    console.assert(checker.check(v2(12, 8), "X"));
}
