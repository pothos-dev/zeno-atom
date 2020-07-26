import * as React from 'react'
import { produce, Draft } from 'immer'
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

// A Dictionary containing arbitrary data and/or callbacks
type BaseProps = Dictionary

// A Dictionary containing arbitrary data
type BaseState = Dictionary

// A Dictionary containing Selector functions
type BaseSelectors<State extends BaseState> = Dictionary<
  // Receive State + additional parameters
  // Return values derived from State
  (state: State, ...params: any[]) => any
>

// A Dictionary containing Updater functions
type BaseUpdaters<
  State extends BaseState,
  Selectors extends BaseSelectors<State>
> = Dictionary<
  // Receive State + Selectors + additional parameters
  // Update State in-place
  // Return nothing
  (state: StateWithSelectors<State, Selectors>, ...params: any[]) => void
>

// A Dictionary containing Callback functions
type BaseCallbacks = Dictionary<
  // Receive any parameters
  // Execute side-effects
  // Return nothing
  (...params: any[]) => void
>

/**
 * Types used in constructing an Atom
 */

// Single argument passed to createAtom()
type CreateAtomArgs<
  Props extends BaseProps,
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State, Selectors>,
  Callbacks extends BaseCallbacks
> =
  // Variant 1: Just pass an AtomInterface
  | AtomInterface<State, Selectors, Updaters, Callbacks>
  // Variant 2: Pass a function returning an AtomInterface. Used to get callbacks into the Atom
  | ((props: Props) => AtomInterface<State, Selectors, Updaters, Callbacks>)

// Defines state and behavior of the Atom
type AtomInterface<
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State, Selectors>,
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

// Tuple returned by createAtom()
type CreateAtomResult<
  Props extends BaseProps,
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State, Selectors>,
  Callbacks extends BaseCallbacks
> = [
  // Provider component to be rendered in the component root
  ComponentType<AtomProviderProps<Props>>,
  // Hook to be used in child components
  () => Atom<State, Selectors, Updaters, Callbacks>
]

// Props of the Provider component
type AtomProviderProps<Props extends BaseProps> = Props & {
  children?: ReactNode
}

// The Atom object returned by the Hook
type Atom<
  State extends BaseState,
  Selectors extends BaseSelectors<State>,
  Updaters extends BaseUpdaters<State, Selectors>,
  Callbacks extends BaseCallbacks
> =
  // prettier-ignore
  // updateState functions
  { [K in keyof Updaters]: FuncWithTailParams<Updaters[K]> }
  // callback functions
  & { [K in keyof Callbacks]: Callbacks[K] }
  // state object with selectors merged in
  & { state: StateWithSelectors<State, Selectors> }

/**
 * Helper Types
 */

// A simple object with string keys
type Dictionary<T = any> = Record<string, T>

// Merges the raw state object with selector functions.
// Selector functions that take only the state as parameter are converted into values.
// Selector functions with additional parameters get converted to a function without the state parameter.
type StateWithSelectors<
  State extends BaseState,
  Selectors extends BaseSelectors<State>
> = State & { [K in keyof Selectors]: ValueOrFuncWithTailParams<Selectors[K]> }

// Given a function with one parameter, converts it into a property.
// Given a function with head + tail parameters, converts it into a function with tail parameters.
type ValueOrFuncWithTailParams<
  Func extends (...params: any[]) => any
> = Func extends (one: any) => any ? ReturnType<Func> : FuncWithTailParams<Func>

// Given a function with head + tail parameters, converts it into a function with tail parameters.
type FuncWithTailParams<Func extends (...params: any[]) => any> = (
  ...params: TailParams<Func>
) => ReturnType<Func>

// Extracts tail parameters from a function
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
  Updaters extends BaseUpdaters<State, Selectors>,
  Callbacks extends BaseCallbacks
>(
  args: CreateAtomArgs<Props, State, Selectors, Updaters, Callbacks>
): CreateAtomResult<Props, State, Selectors, Updaters, Callbacks> {
  // Bring args into "Variant 2" form: `(Props) => AtomInterface`
  const createAtomInterface = typeof args == 'object' ? () => args : args

  // Construct React Context that holds the Atom when provided,
  // but no default value is given (we enforce the use of the Provider)
  const atomContext = createContext<
    Atom<State, Selectors, Updaters, Callbacks>
  >(null as any)

  return [AtomProvider, useAtom]

  function useAtom() {
    return useContext(atomContext)
  }

  /***/

  function AtomProvider(providerProps: AtomProviderProps<Props>) {
    const { children, ...restProps } = providerProps
    const atomProps = (restProps as any) as Props // TS fails us here

    // Construct the AtomInterface object when the Provider is mounted
    const atomInterface = createAtomInterface(atomProps)

    // The provider component owns the Atom state
    const [providerState, setProviderState] = useState(atomInterface.state)

    // Provide an implementation of the Context to children
    return (
      <atomContext.Provider value={createAtom()}>
        {children}
      </atomContext.Provider>
    )

    /***/

    // Given an updater function and additional parameters, update the state using Immer
    function updateState(updater: any, ...params: any[]) {
      // Create a Immer proxy of the state
      const nextState = produce(providerState, (draft) => {
        // Wrap the Immer proxy with another proxy to add selectors
        const stateWithSelectors = createStateWithSelectors(draft)
        // Call the updater, which should update the Immer proxy in-place
        updater(stateWithSelectors, ...params)
      })
      setProviderState(nextState)
    }

    // Given the state object (or a Draft thereof), contains a proxy that merges state and selectors.
    function createStateWithSelectors(
      state: State | Draft<State>
    ): StateWithSelectors<State, Selectors> {
      return new Proxy(state, {
        // We overwrite get(), as it is the only operation used to access selectors
        get(target: any, propName: any) {
          const selector = atomInterface.selectors?.[propName]
          if (!selector) {
            // If we don't have a selector of the given name, pass the get() to the underlying object/proxy
            return target[propName]
          } else if (selector.length < 2) {
            // takes 0 or 1 parameters -> evaluate immediately
            // TODO: should we memoize the value?
            return selector(target)
          } else {
            // takes additional parameters -> inject the state into the selector
            return (...params: any[]) => selector(target, ...params)
          }
        },
      })
    }

    // Create the object that will be returned by the Hook
    function createAtom(): Atom<State, Selectors, Updaters, Callbacks> {
      return new Proxy(
        {} as any, // "Empty" proxy - we're just using the traps to provide access
        {
          get(target, propName: any) {
            // If the state is accessed, return the proxy that merges state with selectors
            if (propName == 'state') {
              return createStateWithSelectors(providerState)
            }

            const callback = atomInterface.callbacks?.[propName]
            if (callback) {
              // If it is a callback, let the caller use it directly
              // TODO: apply `current` to arguments?!
              return callback
            }

            const updater = atomInterface.updaters?.[propName]
            if (updater) {
              // It it is a state updater, wrap the function using Immer
              return (...params: any[]) => updateState(updater, ...params)
            }
          },
        }
      )
    }
  }
}
