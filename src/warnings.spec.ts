import { warnInvalidArgBody } from "./warnings";

describe('warnings', () => {
    describe('warnInvalidArgBody', () => {
        it('works as expected', () => {
            expect(warnInvalidArgBody()).toMatchSnapshot()
        })
    })
})
