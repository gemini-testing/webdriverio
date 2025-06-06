import path from 'node:path'
import { ELEMENT_KEY } from '@testplane/webdriver'
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest'

import { remote } from '../../../src/index.js'
import * as utils from '../../../src/utils/index.js'

vi.mock('fetch')
vi.mock('@testplane/wdio-logger', () => import(path.join(process.cwd(), '__mocks__', '@testplane/wdio-logger')))

describe('selectByVisibleText test', () => {
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
        getElementFromResponseSpy.mockClear()
    })

    it('should select value by visible text', async () => {
        await elem.selectByVisibleText(' someValue1 ')
        const optionSelection = './option[. = "someValue1"]|./option[normalize-space(text()) = "someValue1"]'
        const optgroupSelection = './optgroup/option[. = "someValue1"]|./optgroup/option[normalize-space(text()) = "someValue1"]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value).toBe(
            `${optionSelection}|${optgroupSelection}`
        )
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should select value by visible text with spaces', async () => {
        await elem.selectByVisibleText('some Value1')
        const optionSelection = './option[. = "some Value1"]|./option[normalize-space(text()) = "some Value1"]'
        const optgroupSelection = './optgroup/option[. = "some Value1"]|./optgroup/option[normalize-space(text()) = "some Value1"]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value)
            .toBe(`${optionSelection}|${optgroupSelection}`)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should select value by visible text with leading and trailing white-space', async () => {
        await elem.selectByVisibleText(' someValue1 ')
        const optionSelection = './option[. = "someValue1"]|./option[normalize-space(text()) = "someValue1"]'
        const optgroupSelection = './optgroup/option[. = "someValue1"]|./optgroup/option[normalize-space(text()) = "someValue1"]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value)
            .toBe(`${optionSelection}|${optgroupSelection}`)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should select value by visible text with sequences of whitespace characters', async () => {
        await elem.selectByVisibleText('some    Value1')
        const optionSelection = './option[. = "some Value1"]|./option[normalize-space(text()) = "some Value1"]'
        const optgroupSelection = './optgroup/option[. = "some Value1"]|./optgroup/option[normalize-space(text()) = "some Value1"]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value)
            .toBe(`${optionSelection}|${optgroupSelection}`)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should select value by visible text with quotes', async () => {
        await elem.selectByVisibleText('"someValue1""')
        const optionSelection = './option[. = concat("", \'"\', "someValue1", \'"\', "", \'"\', "")]|./option[normalize-space(text()) = concat("", \'"\', "someValue1", \'"\', "", \'"\', "")]'
        const optgroupSelection = './optgroup/option[. = concat("", \'"\', "someValue1", \'"\', "", \'"\', "")]|./optgroup/option[normalize-space(text()) = concat("", \'"\', "someValue1", \'"\', "", \'"\', "")]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value)
            .toBe(`${optionSelection}|${optgroupSelection}`)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should convert number to string when selecting', async () => {
        await elem.selectByVisibleText(123)
        const optionSelection = './option[. = "123"]|./option[normalize-space(text()) = "123"]'
        const optgroupSelection = './optgroup/option[. = "123"]|./optgroup/option[normalize-space(text()) = "123"]'
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[1][0]!.pathname)
            .toBe('/session/foobar-123/element')
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[2][0]!.pathname)
            .toBe('/session/foobar-123/element/some-elem-123/element')
        expect(JSON.parse(vi.mocked(fetch).mock.calls[2][1]!.body as any).value)
            .toBe(`${optionSelection}|${optgroupSelection}`)
        // @ts-expect-error mock implementation
        expect(vi.mocked(fetch).mock.calls[5][0]!.pathname)
            .toBe('/session/foobar-123/element/some-sub-elem-321/click')
        expect(getElementFromResponseSpy).toBeCalledWith({
            [ELEMENT_KEY]: 'some-sub-elem-321'
        })
    })

    it('should throw if option is not found', async () => {
        const mockElem = {
            $: vi.fn().mockReturnValue(Promise.resolve({
                waitForExist: vi.fn().mockReturnValue(Promise.reject(new Error('Option with text "non-existing-option" not found.')))
            })),
            elementClick: vi.fn().mockReturnValue(Promise.resolve()),
            options: {},
            selector: 'foobar2',
            elementId: 'some-elem-123',
            'element-6066-11e4-a52e-4f735466cecf': 'some-elem-123',
            findElementFromElement: vi.fn().mockReturnValue(Promise.resolve({ error: 'no such element' }))
        }
        // @ts-ignore mock feature
        mockElem.selectByVisibleText = elem.selectByVisibleText.bind(mockElem)

        // @ts-expect-error
        const err = await mockElem.selectByVisibleText('non-existing-option').catch((err: any) => err)
        expect(err.toString()).toBe('Error: Option with text "non-existing-option" not found.')
    })
})
