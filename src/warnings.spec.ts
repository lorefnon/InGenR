import { warnInterpolated, warnInvalidArgBody } from "./warnings";

describe('warnings', () => {
    describe('warnInterpolated', () => {
        it('works as expected', () => {
            expect(warnInterpolated(10)).toMatchSnapshot()
        })
    })
    describe('warnInvalidArgBody', () => {
        it('works as expected', () => {
            expect(warnInvalidArgBody()).toMatchSnapshot()
        })
    })
})
