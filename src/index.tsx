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

type AtomProps = {
  [propName: string]: any
}
type AtomState = any
type AtomSelectors<State extends AtomState> = {
  [functionName: string]: (state: State) => any
}
type AtomStateUpdaters<State extends AtomState> = {
  [functionName: string]: (state: State, ...params: any[]) => void
}
type AtomCallbacks = {
  [functionName: string]: (...params: any[]) => void
}

/**
 * Types used in constructing an Atom
 */

type CreateAtomArgs<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> =
  // Variant 1: Just pass an AtomInterface
  | AtomInterface<Props, State, Selectors, Updaters, Callbacks>
  // Variant 2: Pass a function returning an AtomInterface. Used to get callbacks into the Atom
  | ((
      props: Props
    ) => AtomInterface<Props, State, Selectors, Updaters, Callbacks>)

type AtomInterface<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
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
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> = [
  AtomProvider<Props, State, Selectors, Updaters, Callbacks>,
  AtomHook<Props, State, Selectors, Updaters, Callbacks>
]

export type AtomProvider<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> = ComponentType<
  AtomProviderProps<Props, State, Selectors, Updaters, Callbacks>
>

type AtomProviderProps<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> = Props & {
  children: ReactNode
}

type AtomHook<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> = () => AtomHookValue<Props, State, Selectors, Updaters, Callbacks>

type AtomHookValue<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
> =
  // prettier-ignore
  // updateState functions
  { [FunctionName in keyof Updaters]: WithoutFirstParam<Updaters, FunctionName> }
  // callback functions
  & { [FunctionName in keyof Callbacks]: Callbacks[FunctionName] }
  // state object
  & { state: State }

/**
 * Helper Types
 */

type WithoutFirstParam<
  Updaters extends AtomStateUpdaters<any>,
  FunctionName extends keyof Updaters
> = (...params: TailParams<Updaters[FunctionName]>) => void

type TailParams<Func> = Func extends (head: any, ...tail: infer Tail) => any
  ? Tail
  : never

/**
 * Implementation
 */

export function createAtom<
  Props extends AtomProps,
  State extends AtomState,
  Selectors extends AtomSelectors<State>,
  Updaters extends AtomStateUpdaters<State>,
  Callbacks extends AtomCallbacks
>(
  args: CreateAtomArgs<Props, State, Selectors, Updaters, Callbacks>
): CreateAtomResult<Props, State, Selectors, Updaters, Callbacks> {
  // Bring args into "Variant 2" form: `(Props) => AtomInterface`
  const createAtom = typeof args == 'object' ? () => args : args

  // Construct React Context that holds the AtomHookValue when provided,
  // but no default value is given (we enforce the use of the Provider)
  const atomContext = createContext<
    AtomHookValue<Props, State, Selectors, Updaters, Callbacks>
  >(null as any)

  // Construct Provider component
  function AtomProvider(
    providerProps: AtomProviderProps<
      Props,
      State,
      Selectors,
      Updaters,
      Callbacks
    >
  ) {
    const { children, ...restProps } = providerProps
    const atomProps = (restProps as any) as Props // TS fails us here

    // Construct the Atom when the Provider is mounted
    const atom = createAtom(atomProps)
    const [state, setState] = useState(atom.state)

    // Create the AtomHookValue using Proxy magic
    const value: any = new Proxy(
      {},
      {
        // Capture access to all properties of the AtomHookValue
        get(target, propName, receiver) {
          // All properties handled by us will be accessed with string keys
          if (typeof propName != 'string') return undefined

          // If the state is accessed, let the caller use it directly
          if (propName == 'state') return state

          // Otherwise, either a `stateUpdater` or `callback` is called.

          // If it is a callback, let the caller use it directly
          // (TODO: immer `current`)
          const callback = atom.callbacks?.[propName]
          if (callback) return callback

          // It it is a state updater, wrap the function using Immer
          const update = atom.updaters?.[propName]
          if (update)
            return (...params: any[]) => {
              const nextState = produce(state, (draft: State) =>
                update(draft, ...params)
              )
              setState(nextState)
            }

          // We shouldn't get here, better throw an Error
          throw Error(`unexpected access to ${propName} in AtomHookValue proxy`)
        },
      }
    )

    // Provide an implementation of the Context to children
    return <atomContext.Provider value={value}>{children}</atomContext.Provider>
  }

  // Construct the Hook
  function useAtom() {
    return useContext(atomContext)
  }

  return [AtomProvider, useAtom]
}

// const [MyAtomProvider, useMyAtom] = createAtom({
//   state: {
//     firstName: 'Hello',
//     lastName: 'World',
//   },
//   selectors: {
//     fullName: (s) => `${s.firstName} ${s.lastName}`,
//   },
// })
