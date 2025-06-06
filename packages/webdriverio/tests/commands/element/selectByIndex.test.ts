import path from 'node:path'
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest'
import { ELEMENT_KEY } from '@testplane/webdriver'

import { remote } from '../../../src/index.js'
import * as utils from '../../../src/utils/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('selectByIndex test', () => {
    const getElementFromResponseSpy = vi.spyOn(utils, 'getElementFromResponse')
    let browser: WebdriverIO.Browser
    let elem: any

    beforeEach(async () => {
        browser = await remote({
            baseUrl: 'http://foobar.com',
            capabilities: {
                browserName: 'foobar'
            }
        })
        elem = await browser.$('some-elem-123')
    })

    afterEach(() => {
        vi.mocked(fetch).mockClear()
    })

    it('should select by index', async () => {
        await elem.selectByIndex(1)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/elements')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[4][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-456/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-elem-456',
            index: 1
        })
    })

    it('should throw an error when index < 0', async () => {
        // @ts-ignore uses expect-webdriverio
        expect.hasAssertions()
        try {
            await elem.selectByIndex(-2)
        } catch (err: any) {
            expect(err.toString()).toBe('Error: Index needs to be 0 or any other positive number')
        }
    })

    it('should throw if there are no options elements', async () => {
        // @ts-ignore uses expect-webdriverio
        expect.hasAssertions()
        const mockElem = {
            options: {},
            selector: 'foobar2',
            elementId: 'some-elem-123',
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
            waitUntil: vi.fn().mockRejectedValue(new Error('Select element doesn\'t contain any option element')),
            findElementsFromElement: vi.fn().mockReturnValue(Promise.resolve([]))
        }
        // @ts-ignore mock feature
        mockElem.selectByIndex = elem.selectByIndex.bind(mockElem)

        try {
            await elem.selectByIndex.call(mockElem, 0)
        } catch (err: any) {
            expect(err.toString()).toBe('Error: Select element doesn\'t contain any option element')
        }
    })

    it('should throw if index is out of range', async () => {
        const mockElem = {
            options: {},
            selector: 'foobar',
            findElementsFromElement: vi.fn().mockReturnValue(Promise.resolve([{ elem: 1 }]))
        }
        // @ts-ignore mock feature
        mockElem.selectByIndex = elem.selectByIndex.bind(mockElem)

        // @ts-expect-error
        const err = await mockElem.selectByIndex(2).catch((err: any) => err)
        expect(err.toString()).toBe('Error: Can\'t call selectByIndex on element with selector "foobar" because element wasn\'t found')
    })

    it('should throw if index is out of range', async function () {
        const err = await elem.selectByIndex(3).catch((err: any) => err)
        expect(err.toString()).toBe('Error: Option with index "3" not found. Select element only contains 3 option elements')
    }, { timeout: 10000 })
})
