"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const quick_lru_1 = __importDefault(require("quick-lru"));
const cache = new quick_lru_1.default({
    maxSize: 1000
});
module.exports = cache;
