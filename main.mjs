'use strict';

import Module from './loop.mjs'

const mod = await Module();
export function loop() {
    mod.loop();
}
