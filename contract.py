from pyteal import *
import os
import json

"""
Simple Payment splitter application that does the following:
- accepts funding >= 1 ALGO, takes 3 wallet addresses and records the funder
- split it into those 3 based on the percentages provided 
- retrieve who the funder is
"""

router = Router(
    "split-contract",
    BareCallActions(
        no_op=OnCompleteAction.create_only(Approve()),
        opt_in=OnCompleteAction.call_only(Approve()),
    ),
)

PAYMENT_AMT = Int(1000000)  # 1 million microAlgos = 1 Algo


@Subroutine(TealType.none)
def opt_in_smart_contract_to_asa(asa_id):
    return Seq(
        InnerTxnBuilder.Execute({
            TxnField.type_enum: TxnType.AssetTransfer,
            TxnField.xfer_asset: asa_id,
            TxnField.asset_amount: Int(0),
            TxnField.sender: Global.current_application_address(),
            TxnField.asset_receiver: Global.current_application_address(),
        }),
    )


@Subroutine(TealType.none)
def opt_in_transaction(asa_id: abi.Asset):
    # if smart contract is not opted in to the asset,
    # call smart_contract_opt_in_to_asa()
    return Seq([
        smart_contract_asset_balance := AssetHolding.balance(Global.current_application_address(), asa_id.asset_id()),

        # below if statement returns 1 if the smart contract is not opted in to asset
        If(Not(smart_contract_asset_balance.hasValue())).
        # if smart contract is not opted in to the asset,
        # send an opt in transaction for the asset
        Then(Seq(opt_in_smart_contract_to_asa(asa_id.asset_id())))
        # transfer the asset to the smart contract with a rekey back to the sender
        # Then( Seq( asset_transfer(asa_id, amount)) )
    ])


@router.method
def fund(payment: abi.PaymentTransaction,
         address1: abi.Account, address2: abi.Account, address3: abi.Account,
         percentage1: abi.Uint64, percentage2: abi.Uint64, percentage3: abi.Uint64):
    return Seq(
        (amt := abi.Uint64()).set(payment.get().amount() / Int(100)),
        (bal := abi.Uint64()).set(Balance(payment.get().receiver()) - payment.get().amount()),
        If(bal.get() < Int(120000), amt.set(amt.get() - Int(1200))),
        Assert(payment.get().receiver() == Global.current_application_address()),
        Assert(payment.get().amount() >= PAYMENT_AMT),
        Assert((percentage1.get() + percentage2.get() + percentage3.get()) == Int(100)),
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.Payment,
                TxnField.amount: amt.get() * percentage1.get(),
                TxnField.receiver: address1.address(),
            }
        ),
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.Payment,
                TxnField.amount: amt.get() * percentage2.get(),
                TxnField.receiver: address2.address(),
            }
        ),
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.Payment,
                TxnField.amount: amt.get() * percentage3.get(),
                TxnField.receiver: address3.address(),
            }
        ),
        App.globalPut(Bytes("funder"), payment.get().sender()),
    )


@router.method
def optin_asset(asset_id: abi.Asset):
    return Seq(
        Seq(opt_in_transaction(asset_id)),
    )


@router.method
def fund_asset(payment: abi.AssetTransferTransaction,
               address1: abi.Account, address2: abi.Account, address3: abi.Account,
               percentage1: abi.Uint64, percentage2: abi.Uint64, percentage3: abi.Uint64):
    return Seq(
        (amt := abi.Uint64()).set(payment.get().asset_amount() / Int(100)),  # Calculate the amount for each recipient
        Assert(payment.get().asset_receiver() == Global.current_application_address()),
        # Ensure the receiver is the contract itself
        Assert(payment.get().asset_amount() > Int(0)),  # Ensure the transferred asset amount is greater than 0
        Assert((percentage1.get() + percentage2.get() + percentage3.get()) == Int(100)),
        # Ensure percentages sum to 100

        # Execute asset transfers to the specified addresses based on the provided percentages
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.asset_amount: amt.get() * percentage1.get(),
                TxnField.asset_receiver: address1.address(),
                TxnField.xfer_asset: payment.get().assets[0]
            }
        ),
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.asset_amount: amt.get() * percentage2.get(),
                TxnField.asset_receiver: address2.address(),
                TxnField.xfer_asset: payment.get().assets[0]
            }
        ),
        InnerTxnBuilder.Execute(
            {
                TxnField.type_enum: TxnType.AssetTransfer,
                TxnField.asset_amount: amt.get() * percentage3.get(),
                TxnField.asset_receiver: address3.address(),
                TxnField.xfer_asset: payment.get().assets[0]
            }
        ),

        App.globalPut(Bytes("funder"), payment.get().sender())  # Store the sender's address in global state
    )


@router.method
def get_funder(*, output: abi.Address):
    return output.set(App.globalGet(Bytes("funder")))


if __name__ == "__main__":
    path = os.path.dirname(os.path.abspath(__file__))
    approval, clear, contract = router.compile_program(version=8)

    # Dump out the contract as json that can be read in by any of the SDKs
    with open(os.path.join(path, "artifacts/contract.json"), "w") as f:
        f.write(json.dumps(contract.dictify(), indent=2))

    # Write out the approval and clear programs
    with open(os.path.join(path, "artifacts/approval.teal"), "w") as f:
        f.write(approval)

    with open(os.path.join(path, "artifacts/clear.teal"), "w") as f:
        f.write(clear)
