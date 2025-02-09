import {useWeb3React, initializeConnector} from '@web3-react/core';
import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import {Magic} from '@web3-react/magic';
import {MetaMask} from '@web3-react/metamask'
import {useHistory} from 'react-router-dom';
import {useCurrentProfile} from './Utils';
import {NotificationHandlerContext} from './ErrorHandler';
import {SuperfluidContext} from './Superfluid';
import {FAUCET_URI} from './Config';
import { hooks as hooksmetaMask, metaMask } from './connectors/metaMask';
import { hooks as hooksMagic, magic } from './connectors/magic';
import { createWeb3ReactStoreAndActions } from '@web3-react/store';

import type { Actions, Web3ReactStore } from '@web3-react/types';
import { WalletConnect } from '@web3-react/walletconnect'

import type {
  LoginWithMagicLinkConfiguration,
  Magic as MagicInstance,
  MagicSDKAdditionalConfiguration,
} from 'magic-sdk'

let store: Web3ReactStore
let actions: Actions;
[store, actions] = createWeb3ReactStoreAndActions()

const Web3UtilsContext = createContext<any>(null);
const Web3UtilsProviderContext = createContext<any>({
  provider: null,
  setProvider: () => {},
});
const Web3UtilsProvider = (props) => {
  const {connector, account, chainId} = useWeb3React();
  const {currentProfile} = useCurrentProfile();
  const history = useHistory();
  const notificationHandler = useContext(NotificationHandlerContext);

  const [magicEmail, setMagicEmail] = useState<string>('');
  const superfluid = useContext(SuperfluidContext);
  const faucetUsed = useRef(false);

  const [isWaiting, setIsWaiting] = useState<any>(false);
  // useEffect(() => {
  //   if (!account || !superfluid || chainId !== 80001 || faucetUsed.current)
  //     return;
  //   let {usdcx} = superfluid
  //   usdcx.balanceOf(account).then(async balance => {
  //     if (!faucetUsed.current && balance.isZero()) {
  //       // never turn it to false, if we try to use the faucet and it fails we don't want to retry excessively
  //       faucetUsed.current = true;
  //       let response = await fetch(FAUCET_URI + '?address=' + account)
  //       if (response.ok) {
  //         notificationHandler.setNotification({
  //           description: 'We just sent some test tokens to your wallet so you can test the platform! Enjoy!',
  //           type: 'success'
  //         });
  //       }
  //     }
  //   })

  // }, [account, superfluid, notificationHandler, chainId])

  async function tryConnect() {
    // notificationHandler.setNotification({description: 'Thanks for testing the platform. More features will be released in the next few days. Stay tuned!', type: 'info'})
    // return;
    //TODO: test walletConnect and open up a modal
    
    await metaMask.activate();

    let test = store.getState();
    console.log('test ', test);
    // const injected = new InjectedConnector({supportedChainIds: [1, 3, 4, 5, 42, 137, 80001]});
    // if (await injected.getProvider())
    //   activate(injected, (error) => {
    //     notificationHandler.setNotification({
    //       description: 'Unable to connect to wallet. ' + error.message,
    //       type: 'error',
    //     });
    //   });
    // else {
    //   notificationHandler.setNotification({
    //     description: 'Only injected providers (e.g. metamask) are supported at the moment',
    //     type: 'error',
    //   });
    // }
  }

  async function tryWalletConnect() {
    // notificationHandler.setNotification({description: 'Thanks for testing the platform. More features will be released in the next few days. Stay tuned!', type: 'info'})
    // return;
    //TODO: test walletConnect and open up a modal



    const RPC_URLS: {[chainId: number]: string} = {
      1: process.env.RPC_URL_1 as string,
      4: process.env.RPC_URL_4 as string,
    };

    //@ts-ignore
    const walletConnect = new WalletConnect(actions, {
          rpc: {1: RPC_URLS[1]},
        })


    await walletConnect.activate()

    let test = store.getState();
    console.log('test ', test);

    // const walletconnect = new WalletConnectConnector({
    //   rpc: {1: RPC_URLS[1]},
    //   bridge: 'https://bridge.walletconnect.org',
    //   qrcode: true,
    //   supportedChainIds: [1, 3, 4, 5, 42, 137, 80001],
    // });

    // connector.activate(walletconnect, (error) => {
    //   notificationHandler.setNotification({
    //     description: 'Unable to open WalletConnect. ' + error.message,
    //     type: 'error',
    //   });
    // });
  }

  async function tryMagicLink() {

    console.log('test');

    

    const customNodeOptions = {
      rpcUrl: chainId === 137 ? 'https://rpc-mainnet.maticvigil.com/' : 'https://rpc-mumbai.maticvigil.com/', // Polygon RPC URL
      chainId: chainId, // Polygon chain id
    }

    // const customNodeOptions = {
    //   rpcUrl: 'https://rpc-mainnet.maticvigil.com/', // Polygon RPC URL
    //   chainId: 137, // Polygon chain id
    // }
    
    // Setting network to Polygon
    //const magic = new Magic('pk_live_55D93A0BD91B3D6E', { network: customNodeOptions });
    //@ts-ignore

    //const magic = new Magic(actions, {apiKey: 'pk_live_55D93A0BD91B3D6E', network: customNodeOptions});

    await magic.activate({email: magicEmail, showUI: true})

    let test = store.getState();
    console.log('test ', test);
  }

  function isSignedUp() {
    if (!account) {
      tryConnect();
      return false;
    }
    if (!currentProfile) {
      history.push('/signup');
      notificationHandler.setNotification({description: 'You need to sign up in the platform first.', type: 'info'});
      return false;
    }
    return true;
  }

  const wrongChainId = Boolean(chainId !== 80001);

  return (
    <Web3UtilsContext.Provider
      value={{
        connect: tryConnect,
        walletConnect: tryWalletConnect,
        magicConnect: tryMagicLink,
        isSignedUp: isSignedUp,
        setMagicEmail: setMagicEmail,
        setIsWaiting: setIsWaiting,
        isWaiting: isWaiting,
        waitingMessage: isWaiting === true ? 'Waiting for blockchain transaction confirmation' : isWaiting,
        disableInteraction: Boolean(isWaiting) || (wrongChainId && chainId !== 137),
      }}
    >
      {props.children}
    </Web3UtilsContext.Provider>
  );
};
export {Web3UtilsContext, Web3UtilsProvider, Web3UtilsProviderContext};
