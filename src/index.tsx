import * as React from 'react'
import { produce } from 'immer'
import {
  createContext,
  useContext,
  ReactNode,
  ComponentType,
  useState,
} from 'react'

/**
 * Base types to constrain generic type arguments
 */

type BaseProps = {
  [propName: string]: any
}
type BaseState = Record<string, any>
type BaseSelectors<State extends BaseState> = {
  [functionName: string]: (state: State) => any
}
type BaseUpdaters<State extends BaseState> = {
  [functionName: string]: (state: State, ...params: any[]) => void
}
type BaseCallbacks = {
  [functionName: string]: (...params: any[]) => void
}

/**
 * Types used in constructing an Atom
 */

type CreateAtomArgs<
  Props extends BaseProps,
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
> =
  // Variant 1: Just pass an AtomInterface
  | AtomInterface<State, Selectors, Updaters, Callbacks>
  // Variant 2: Pass a function returning an AtomInterface. Used to get callbacks into the Atom
  | ((props: Props) => AtomInterface<State, Selectors, Updaters, Callbacks>)

type AtomInterface<
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
> = {
  state: State
  selectors?: Selectors
  updaters?: Updaters
  callbacks?: Callbacks
}

/**
 * Types describing the constructed Atom
 */

type CreateAtomResult<
  Props extends BaseProps,
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
> = [AtomProvider<Props>, AtomHook<State, Selectors, Updaters, Callbacks>]

export type AtomProvider<Props extends BaseProps> = ComponentType<
  AtomProviderProps<Props>
>

type AtomProviderProps<Props extends BaseProps> = Props & {
  children: ReactNode
}

type AtomHook<
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
> = () => AtomHookValue<State, Selectors, Updaters, Callbacks>

type AtomHookValue<
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
> =
  // prettier-ignore
  // updateState functions
  { [FunctionName in keyof Updaters]: WithoutFirstParam<Updaters, FunctionName> }
  // callback functions
  & { [FunctionName in keyof Callbacks]: Callbacks[FunctionName] }
  // state object with selectors merged in
  & { state: StateWithSelectors<State, Selectors> }

type StateWithSelectors<
  State extends BaseState,
  Selectors extends BaseSelectors<State>
> = State &
  { [FunctionName in keyof Selectors]: ReturnType<Selectors[FunctionName]> }

/**
 * Helper Types
 */

type WithoutFirstParam<
  Updaters extends BaseUpdaters<any>,
  FunctionName extends keyof Updaters
> = (...params: TailParams<Updaters[FunctionName]>) => void

type TailParams<Func> = Func extends (head: any, ...tail: infer Tail) => any
  ? Tail
  : never

/**
 * Implementation
 */

export function createAtom<
  Props extends BaseProps,
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State>,
  Callbacks extends BaseCallbacks
>(
  args: CreateAtomArgs<Props, State, Selectors, Updaters, Callbacks>
): CreateAtomResult<Props, State, Selectors, Updaters, Callbacks> {
  // Bring args into "Variant 2" form: `(Props) => AtomInterface`
  const createAtom = typeof args == 'object' ? () => args : args

  // Construct React Context that holds the AtomHookValue when provided,
  // but no default value is given (we enforce the use of the Provider)
  const atomContext = createContext<
    AtomHookValue<State, Selectors, Updaters, Callbacks>
  >(null as any)

  // Construct Provider component
  function AtomProvider(providerProps: AtomProviderProps<Props>) {
    const { children, ...restProps } = providerProps
    const atomProps = (restProps as any) as Props // TS fails us here

    // Construct the Atom when the Provider is mounted
    const atom = createAtom(atomProps)
    const [state, setState] = useState(atom.state)

    // Given an updater function and additional parameters, update the state using Immer
    const updateState = (updater: any, ...params: any[]) =>
      setState(produce(state, (draft: State) => updater(draft, ...params)))

    const createStateProxy = (): StateWithSelectors<State, Selectors> =>
      new Proxy(
        {},
        {
          get(target, propName, receiver) {
            if (typeof propName != 'string') {
              // All properties handled by us will be accessed with string keys, so if we get something else, ignore it
              return undefined
            }

            const selector = atom.selectors?.[propName]
            if (selector) {
              // If it is a selector, calculate the value and return it here
              // TODO: should we memoize the value?
              return selector(state)
            }

            // In all other cases, assume we access a property on the state object directly
            return state[propName]
          },
        }
      ) as any

    const createAtomProxy = (): AtomHookValue<
      State,
      Selectors,
      Updaters,
      Callbacks
    > =>
      new Proxy(
        {},
        {
          // Capture access to all properties of the AtomHookValue
          get(target, propName, receiver) {
            if (typeof propName != 'string') {
              // All properties handled by us will be accessed with string keys, so if we get something else, ignore it
              return undefined
            }

            if (propName == 'state') {
              // If the state is accessed, return a proxy around it that provides access to the selectors
              return createStateProxy()
            }

            const callback = atom.callbacks?.[propName]
            if (callback) {
              // If it is a callback, let the caller use it directly
              // TODO: apply `current` to arguments?!
              return callback
            }

            const updater = atom.updaters?.[propName]
            if (updater) {
              // It it is a state updater, wrap the function using Immer
              return (...params: any[]) => updateState(updater, ...params)
            }
          },
        }
      ) as any

    // Provide an implementation of the Context to children
    return (
      <atomContext.Provider value={createAtomProxy()}>
        {children}
      </atomContext.Provider>
    )
  }

  // Construct the Hook
  function useAtom() {
    return useContext(atomContext)
  }

  return [AtomProvider, useAtom]
}
