import {useParams} from 'react-router-dom';
import React, {CSSProperties, useContext, useEffect, useState} from 'react';
import {useWeb3React} from './web3-react/core';
import {Web3Provider} from '@ethersproject/providers';
import {ApolloClient, gql, InMemoryCache, useQuery} from '@apollo/client';
import {SuperfluidContext} from './Superfluid';
import {parseUnits} from '@ethersproject/units';
import {wad4human} from '@decentral.ee/web3-helpers';
import {defaultAbiCoder} from '@ethersproject/abi';
import creaton_contracts from './Contracts';
import {useCurrentCreator} from './Utils';
//import {TextileContext} from "./TextileProvider";
import {LitContext} from './LitProvider';
import {Base64} from 'js-base64';
import {Contract, ethers} from 'ethers';
import {NotificationHandlerContext} from './ErrorHandler';
import {VideoPlayer} from './VideoPlayer';
import {Button} from './elements/button';
import {Card} from './components/card';
import {Avatar} from './components/avatar';
import {REPORT_URI, REACTION_ERC20, REACTION_CONTRACT_ADDRESS} from './Config';
import {Web3UtilsContext} from './Web3Utils';
import {Link} from 'react-router-dom';
import LitJsSdk from 'lit-js-sdk';
import {Player} from '@lottiefiles/react-lottie-player';
import {Splash} from './components/splash';
import {BICONOMY_API, BICONOMY_AUTH} from './Config';
import { ConstantFlowAgreementV1Helper } from '@superfluid-finance/js-sdk';

interface params {
  id: string;
}

export function Discovery() {
  let {id} = useParams<params>();
  const creatorContractAddress = id;
  const CONTENTS_QUERY = gql`
    query GET_CONTENTS($user: [Bytes!]) {
      contents(orderBy: date, orderDirection: desc, where: {tier: 0, hide: false}) {
        id
        name
        creatorContract
        type
        description
        date
        ipfs
        tokenId
        tier
        hide
      }
    }
  `;
  const SUBSCRIPTION_QUERY = gql`
    query GET_SUBSCRIPTION_STATUS($user: Bytes!, $creator: Bytes!) {
      subscribers(where: {user: $user, creatorContract: $creator}) {
        status
      }
    }
  `;
  const GET_SUBSCRIPTIONS_QUERY = gql`
    query GET_SUBSCRIPTIONS($user: Bytes!) {
      subscribers(where: {user: $user, status: "subscribed"}) {
    	creator {
    	  id
    	}
      status
    }
  }
  `;
  const CONTRACT_INFO_QUERY = gql`
    query GET_CONTRACT($contractAddress: Bytes!) {
      creators(where: {creatorContract: $contractAddress}) {
        id
        user
        creatorContract
        description
        subscriptionPrice
        timestamp
        profile {
          data
        }
      }
    }
  `;
  const REACTIONS_QUERY = gql`
    query($nftAddress: Bytes!) {
      reactions(where: {reactionRecipientAddress: $nftAddress}) {
        id
        amount,
        reactionRecipientAddress,
        tokenId
        reactingUser {
          address
        }
      }
    }
  `;

  //const textile = useContext(TextileContext)
  const litNode = useContext(LitContext);
  const notificationHandler = useContext(NotificationHandlerContext);
  const web3utils = useContext(Web3UtilsContext);
  const context = useWeb3React<Web3Provider>();
  const getSubscriptionsQuery = useQuery(GET_SUBSCRIPTIONS_QUERY, {variables: {user: context.account}, pollInterval: 10000});
  console.log(getSubscriptionsQuery.data)
  const contentsQuery = useQuery(CONTENTS_QUERY, { pollInterval: 10000});
  
  
  function updateContentsQuery() {
    //updateReactions(creatorContractAddress);
    contentsQuery.refetch({user: ["0xefd13a5e268e7c9acd05513090d043c8ae80608e", "0x65a7d5cc1ead16adbe2e83f59c73059f7ec3356f"]});
    console.log('"smart" refetch was run');
  }
  //function updateSubscriptionsQuery() {
    //contentsQuery.refetch({user: context.account});
    //console.log('"smart" refetch was run');
  //}
  const contractQuery = useQuery(CONTRACT_INFO_QUERY, {variables: {contractAddress: "0xefd13a5e268e7c9acd05513090d043c8ae80608e"}});
  const subscriptionQuery = useQuery(SUBSCRIPTION_QUERY, {
    variables: {
      user: context.account,
      creator: "0xefd13a5e268e7c9acd05513090d043c8ae80608e",
    },
    pollInterval: 10000,
  });

  const superfluid = useContext(SuperfluidContext);
  const [usdcx, setUsdcx] = useState(0);
  const {currentCreator} = useCurrentCreator();

  const [reactions, setReactions] = useState<Array<any>>();
  const [reactionErc20Available, setReactionErc20Available] = useState<string>();
  const [reactionErc20Symbol, setReactionErc20Symbol] = useState<string>();

  async function getUsdcx() {
    if (!superfluid) return;
    let {usdcx} = superfluid;
    let subscriber = context.account;
    if (!subscriber) return;
    setUsdcx(wad4human(await usdcx.balanceOf(subscriber)));
  }

  useEffect(() => {
    getUsdcx();
  }, [context, superfluid]);
  const [downloadStatus, setDownloadStatus] = useState({});
  const [downloadCache, setDownloadCache] = useState({});
  const [subscription, setSubscription] = useState('unsubscribed');
  const [isSelf, setIsSelf] = useState(false);
  useEffect(() => {
    if (currentCreator) {
      setIsSelf(currentCreator.creatorContract === creatorContractAddress);
    }
    if (subscriptionQuery.data) {
      if (subscriptionQuery.data.subscribers.length > 0) setSubscription(subscriptionQuery.data.subscribers[0].status);
      else setSubscription('unsubscribed');
    }
  }, [subscriptionQuery, context]);
  //let isSelf = currentCreator && currentCreator.creatorContract === creatorContractAddress;

  const canDecrypt = isSelf || subscription === 'subscribed';

  useEffect(() => {
    if (contentsQuery.loading || contentsQuery.error) return;
    //if (!textile) return;
    if (!canDecrypt) return;
    
    if (getSubscriptionsQuery.loading || getSubscriptionsQuery.error) return;
    const contents = contentsQuery.data.contents;
    console.log('contentsQuery:', contentsQuery.data.contents[0]);

    if (Object.keys(downloadStatus).length === 0 || !contents) return;
    if (contents.some((x) => downloadStatus[x.ipfs] === 'downloading')) {
      console.log('already downloading some stuff');
      return;
    }
    for (let content of contents) {
      if (content.tier == 0) continue;
      if (downloadStatus[content.ipfs] === 'pending') {
        setDownloadStatus({...downloadStatus, [content.ipfs]: 'downloading'});
        decrypt(content)
          .then((decrypted) => {
            //console.log('decrypted promise result', decrypted)
            if (decrypted !== undefined) {
              const blob = new Blob([decrypted], {type: content.type});
              const url = window.URL.createObjectURL(blob);
              setDownloadCache({...downloadCache, [content.ipfs]: url});
              setDownloadStatus({...downloadStatus, [content.ipfs]: 'cached'});
            }
          })
          .catch((e) => {
            console.log(e);
            setDownloadStatus({...downloadStatus, [content.ipfs]: 'error'});
          });
        break;
      }
    }
  }, [downloadStatus, canDecrypt]);

  useEffect(() => {
    (async function iife() {
      if(!context.library) return;
      const signer = context.library.getSigner()
      const userAddress = await signer.getAddress();

      const erc20Contract: Contract = new Contract(REACTION_ERC20, creaton_contracts.erc20.abi, signer);
      setReactionErc20Available((await erc20Contract.balanceOf(userAddress)).toString());
      setReactionErc20Symbol(await erc20Contract.symbol());
    })();
  }, [contentsQuery, creatorContractAddress, context.library]);

  const reactionsQuery = useQuery(REACTIONS_QUERY, {
    variables: {'nftAddress': creatorContractAddress},
    pollInterval: 10000,
  });

  useEffect(() => {
    if (reactionsQuery.data) {
      setReactions(reactionsQuery.data.reactions);    
    }
  }, [reactionsQuery, context]);

  async function addGasless() {
    if(!context.library) return;
    const signer = context.library.getSigner()
    const walletAddress = await signer.getAddress();

    const signedMessage = await signer.signMessage(`Creaton: Enabling gasless transactions for ${walletAddress}`);
    const response = await fetch(`http://localhost:3333/gasless`, {
      method: "post",
      headers:{
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({signedMessage, walletAddress, creatorContractAddress})
    });
  }

  async function mint() {
    let {sf, usdc, usdcx} = superfluid;
    let subscriber = context.account;
    console.log('minted', wad4human(await usdc.balanceOf(subscriber)), 'usdc');
    const tx = await usdc.mint(subscriber, parseUnits('1000', 18), {from: subscriber});
    await tx.wait();
    console.log('this is mint tx', tx);
    console.log('minted', wad4human(await usdc.balanceOf(subscriber)), 'usdc');
  }

  async function approveUSDC() {
    let {sf, usdc, usdcx} = superfluid;
    let subscriber = context.account;
    console.log('approved', wad4human(await usdc.allowance(subscriber, usdcx.address)), 'usdc');
    const tx = await usdc.approve(usdcx.address, parseUnits('1800', 18), {from: subscriber});
    await tx.wait();
    console.log('approved', wad4human(await usdc.allowance(subscriber, usdcx.address)), 'usdc');
  }

  async function getAllContent() {

  }

  async function convertUSDCx() {
    let {sf, usdc, usdcx} = superfluid;
    let subscriber = context.account;
    console.log('converted', wad4human(await usdcx.balanceOf(subscriber)), 'usdc to usdcx');
    const tx = await usdcx.upgrade(parseUnits('900', 18), {from: subscriber});
    await tx.wait();
    let usdcxBalance = wad4human(await usdcx.balanceOf(subscriber));
    setUsdcx(usdcxBalance);
    console.log('converted', usdcxBalance, 'usdc to usdcx');
  }

  async function startStreaming() {
    let call;
    const contract = contractQuery.data.creators[0];
    let MINIMUM_FLOW_RATE = parseUnits(contract.subscriptionPrice, 18).div(3600 * 24 * 30);
    let {sf, usdc, usdcx} = await superfluid;
    let subscriber = context.account;
    const creatorContract = new Contract(creatorContractAddress, creaton_contracts.Creator.abi).connect(
      context.library!.getSigner()
    );
    call = [
      [
        1, // approve the ticket fee
        usdcx.address,
        defaultAbiCoder.encode(
          ['address', 'uint256'],
          [creatorContractAddress, parseUnits(contract.subscriptionPrice, 18).toString()]
        ),
      ],
      [
        202, // callAppAction to participate
        creatorContractAddress,
        creatorContract.interface.encodeFunctionData('upfrontFee', ['0x']),
        //app.contract.methods.upfrontFee("0x").encodeABI()
        //defaultAbiCoder.encode(['address', 'uint256'], [contractAddress, parseEther('10')]
      ],
      [
        201, // create constant flow (10/mo)
        sf.agreements.cfa.address,
        defaultAbiCoder.encode(
          ['bytes', 'bytes'],
          [
            sf.agreements.cfa.contract.methods
              .createFlow(usdcx.address, creatorContractAddress, MINIMUM_FLOW_RATE.toString(), '0x')
              .encodeABI(),
            defaultAbiCoder.encode(['string'], ['']),
          ]
        ),
      ],
    ];
    const tx = await sf.host.batchCall(call, {from: subscriber});
    web3utils.setIsWaiting(true);
    await tx.wait(1);
    web3utils.setIsWaiting(false);
    console.log('subscribed');
  }

  async function decrypt(content) {
    //if (content.ipfs.startsWith('/ipfs'))
    //  encObject = await textile!.downloadEncryptedFile(content.ipfs)
    //else {//handle arweave

    const encryptedZipBlob = await (await fetch('https://arweave.net/' + content.ipfs)).blob();
    const authSig = await LitJsSdk.checkAndSignAuthMessage({chain: 'mumbai'});

    let {decryptedFile} = await LitJsSdk.decryptZipFileWithMetadata({
      authSig: authSig,
      file: encryptedZipBlob,
      litNodeClient: litNode,
    });

    let files = await decryptedFile;
    return files;
  }

  if (contentsQuery.loading || contractQuery.loading) {
    return <Splash src="https://assets5.lottiefiles.com/packages/lf20_bkmfzg9t.json"></Splash>;
  }
  if (contentsQuery.error || contractQuery.error) {
    return <div>{contentsQuery.error}</div>;
  }
  const contents = contentsQuery.data.contents;
  if (Object.keys(downloadStatus).length === 0 && contents.length > 0) {
    const status = {};
    contents.forEach((x) => {
      status[x.ipfs] = 'pending';
    });
    console.log('setting download status', status);
    setDownloadStatus(status);
  }
  const contract = contractQuery.data.creators[0];

  function getSrc(content) {
    let src;
    if (content.tier === 0) src = 'https://arweave.net/' + content.ipfs;
    else {
      if (downloadStatus[content.ipfs] !== 'cached') return;
      src = downloadCache[content.ipfs];
    }
    return src;
  }

  function showContent(content) {
    let src;
    if (content.tier === 0) src = 'https://arweave.net/' + content.ipfs;
    else {
      if (downloadStatus[content.ipfs] !== 'cached') return;
      src = 'data:' + content.type + ';base64, ' + Base64.fromUint8Array(downloadCache[content.ipfs]);
    }
    if (content.type.startsWith('image')) {
      return <img style={{maxWidth: '150px'} as CSSProperties} src={src} />;
    } else if (content.type.startsWith('video')) {
      return <video controls style={{maxWidth: '300px'} as CSSProperties} src={src} />;
    } else if (content.type === 'application/vnd.apple.mpegurl') {
      return <VideoPlayer url={src} />;
    }
  }

  function loadContent() {
    const myPromise = new Promise((resolve, reject) => {
        
    });
  }

  function showItem(content) {
    let src = getSrc(content);
    let fileType;
    console.log('showItem', isSelf);
    if (content.type.startsWith('image')) {
      fileType = 'image';
    } else if (content.type == 'text') {
      fileType = 'text';
    } else if (content.type.startsWith('application/vnd.apple.mpegurl')) {
      fileType = 'video';
    } else {
      fileType = 'image';
    }
    console.log(content);

    if (!content.hide || isSelf) {
      return (
        <Card
          key={content.ipfs}
          fileUrl={src || null}
          name={content.name}
          description={content.description}
          fileType={fileType}
          date={content.date}
          avatarUrl=""
          onReport={() => {
            report(content);
          }}
          isCreator={isSelf}
          hide={content.hide}
          onHide={() => {
            hide(content.tokenId, !content.hide);
          }}
          canDecrypt={canDecrypt}
          reactionErc20Available={reactionErc20Available}
          reactionErc20Symbol={reactionErc20Symbol}
          onReact={(amount, callback) => { react(content, amount, callback) }}
          hasReacted={hasReacted(content)}
          initialReactCount={countReacted(content)}
        />
      );
    } else return;
  }

  async function subscribe() {
    if (!web3utils.isSignedUp()) return;
    const creatorContract = new Contract(creatorContractAddress, creaton_contracts.Creator.abi).connect(
      context.library!.getSigner()
    );
    const receipt = await creatorContract.subscribe();
    web3utils.setIsWaiting(true);
    await receipt.wait(1);
    web3utils.setIsWaiting(false);
    notificationHandler.setNotification({description: 'Sent subscription request', type: 'success'});
  }

  async function react(content, amount, callback) {
    if (!web3utils.isSignedUp()) return;

    try {
      // Allowance
      const signer = context.library!.getSigner()
      const userAddress = await signer.getAddress();

      const erc20Contract: Contract = new Contract(REACTION_ERC20, creaton_contracts.erc20.abi, signer);

      const preDecimals = await erc20Contract.decimals();
      const decimals = ethers.BigNumber.from(10).pow(preDecimals);
      const stakingAmount = ethers.BigNumber.from(amount).mul(decimals);

      const allowance = await erc20Contract.allowance(userAddress, REACTION_CONTRACT_ADDRESS);
      if(stakingAmount.gt(allowance)){
        let tx = await erc20Contract.approve(REACTION_CONTRACT_ADDRESS, stakingAmount);
        await tx.wait();
        let receipt = await tx.wait();
        receipt = receipt.events?.filter((x: any) => {return x.event == "Approval"})[0];
        if(receipt.length == 0){
          throw Error('Error allowing token for reaction');
        }
      }
      const reactionTokenContract: Contract = new Contract(REACTION_CONTRACT_ADDRESS, creaton_contracts.ReactionToken.abi).connect(context.library!.getSigner());

      await reactionTokenContract.stakeAndMint(stakingAmount.toString(), REACTION_ERC20, creatorContractAddress, content.tokenId);
      reactionTokenContract.once("Staked", async (author, amount, stakingTokenAddress, stakingSuperTokenAddress) => {
        updateContentsQuery();
        callback();
      });
    } catch (error: any) {
      notificationHandler.setNotification({description: 'Could not react to the content' + error.message, type: 'error'});
    }
  }

  function countReacted(content): string {
    if (!reactions) return '0';
    const count = reactions
      .filter((r) => r.tokenId === content.tokenId)
      .reduce((sum, current) => sum + +current.amount, 0);

    let res = ethers.utils.formatEther(count.toLocaleString('fullwide', {useGrouping: false}));
    return (Math.round(+res*1e2) / 1e2).toString();
  }
  function hasReacted(content) {
    if (!reactions) return false;
    return reactions.some((r) => r.tokenId === content.tokenId && r.reactingUser.address === context.account?.toLowerCase());
  }

  async function hide(tokenId, hide: boolean) {
    if (!web3utils.isSignedUp()) return;
    const creatorContract = new Contract(creatorContractAddress, creaton_contracts.Creator.abi).connect(
      context.library!.getSigner()
    );
    const receipt = await creatorContract.hidePost(tokenId, hide);
    web3utils.setIsWaiting(true);
    await receipt.wait(1);
    web3utils.setIsWaiting(false);
    notificationHandler.setNotification({
      description: hide ? 'Content hidden from public or subscribers' : 'Content visible again',
      type: 'success',
    });
  }

  async function report(content) {
    if (!web3utils.isSignedUp()) return;
    try {
      const message =
        'I want to report the content with token id ' +
        content.tokenId +
        ' in contract ' +
        creatorContractAddress +
        ' on the Creaton platform.';
      const signature = await context.library!.getSigner().signMessage(message);
      const response = await fetch(REPORT_URI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature: signature,
          tokenId: content.tokenId,
          contract: creatorContractAddress,
          signer: context.account,
        }),
      });
      await response;
      notificationHandler.setNotification({
        description: 'Content reported. Thanks for contributing to the platform :)',
        type: 'success',
      });
    } catch (error: any) {
      notificationHandler.setNotification({description: 'Could not report content' + error.message, type: 'error'});
    }
  }

  return (
    <div>
      {/* <StickyHeader name={contractQuery.data.creators[0].profile !== null ? JSON.parse(contractQuery.data.creators[0].profile.data).username : contractQuery.data.creators[0].id} src={ contractQuery.data.creators[0].profile !== null ? JSON.parse(contractQuery.data.creators[0].profile.data).image : ""} button={generateButton()}/> */}
      <div className="flex flex-col max-w-5xl my-0 pt-20 mx-auto text-center py-5 text-center">
        <h1 className="mb-5 text-2xl font-bold text-white">
          Latest content
        </h1>
        <div className="py-5">
          {
            //reactions &&
            contents.map((x) => showItem(x))
          }
        </div>
      </div>
    </div>
  );
}
