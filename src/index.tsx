import * as React from 'react'
import { produce } from 'immer'
import {
  createContext,
  useContext,
  ReactNode,
  ComponentType,
  useState,
} from 'react'

interface AtomInterface<State, Messages extends AtomMessages<State>> {
  state: State
  messages: Messages
}

type AtomMessages<State> = {
  [messageName: string]: (state: State, ...args: any[]) => void
}

type Atom<State, Messages extends AtomMessages<State>> = [
  AtomProvider<State>,
  AtomHook<State, Messages>
]

type AtomProvider<State> = ComponentType<AtomProviderProps<State>>

type AtomProviderProps<State> = {
  children: ReactNode
  initialState?: State
}

type AtomHook<
  State,
  Messages extends AtomMessages<State>
> = () => AtomHookValue<State, Messages>

type AtomHookValue<State, Messages extends AtomMessages<State>> = {
  state: State
  dispatch: AtomDispatch<State, Messages>
}

type AtomDispatch<State, Messages extends AtomMessages<State>> = {
  [Message in keyof Messages]: (...args: MessageArgs<Messages[Message]>) => void
}

type MessageArgs<Func> = Func extends (state: any, ...args: infer Args) => any
  ? Args
  : never

export function zenoAtom<State, Messages extends AtomMessages<State>>(
  atom: AtomInterface<State, Messages>
): Atom<State, Messages> {
  const atomContext = createContext({
    state: atom.state,
    dispatch: createDispatch(() => {
      throw Error(
        'Cannot use dispatch without a Provider in the component tree'
      )
    }),
  })

  function createDispatch(
    handler: (message: keyof Messages, ...args: any) => void
  ) {
    return new Proxy(
      {},
      {
        get(target, prop, receiver) {
          return function (...args: any[]) {
            handler(prop as keyof Messages, ...args)
          }
        },
      }
    ) as AtomDispatch<State, Messages>
  }

  function Provider(props: AtomProviderProps<State>) {
    const [state, setState] = useState(props.initialState ?? atom.state)

    const dispatch = createDispatch((message, ...args) => {
      const messageHandler = atom.messages[message]
      const newState = produce(state, (draft: State) => {
        messageHandler(draft, ...args)
      })
      setState(newState)
    })

    return (
      <atomContext.Provider value={{ state, dispatch }}>
        {props.children}
      </atomContext.Provider>
    )
  }

  function hook() {
    return useContext(atomContext)
  }

  return [Provider, hook]
}
